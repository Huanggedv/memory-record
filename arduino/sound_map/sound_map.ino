#include <Arduino.h>
#include <ctype.h>
#include <string.h>

const uint8_t FSR_PIN = A0;
const uint8_t POT_PIN = A1;
const uint8_t PIEZO_PIN = 8;
const uint8_t LED_PIN = 5;

const int PRESS_THRESHOLD = 650;
const int RELEASE_THRESHOLD = 550;
const int PRESS_FULL_SCALE = 950;

const bool LED_FOLLOWS_POT = false;
const bool REVERSE_POT = false;
const bool STARTUP_BEEP = true;
const int FLASH_BRIGHTNESS = 255;
const unsigned int BEEP_HZ = 2000;

const uint32_t SAMPLE_MS = 2;
const uint8_t PRESS_CONFIRM_SAMPLES = 2;
const uint32_t RELEASE_CONFIRM_MS = 20;
const uint32_t HIT_COOLDOWN_MS = 180;
const uint32_t HIT_BEEP_MS = 200;
const uint32_t LED_FLASH_MS = 450;
const uint32_t PRESSURE_PACKET_MS = 100;
const uint32_t POT_PACKET_MS = 40;
const int FSR_PRESS_DELTA = 100;
const int FSR_RELEASE_DELTA = 45;

int fsrRaw = 0;
int potRaw = 0;
int potValue = 0;
int ledBrightness = -1;
int fsrBaseline = 0;
float fsrDisplay = 0;
float potFiltered = 0;

bool pressed = false;
uint8_t highSamples = 0;
bool releasePending = false;
uint32_t releaseStartedAt = 0;
uint32_t lastSampleAt = 0;
uint32_t lastHitAt = 0;
uint32_t lastPressurePacket = 0;
uint32_t lastPotPacket = 0;

bool beeping = false;
uint32_t beepStartedAt = 0;
uint32_t beepDuration = 0;
bool flashActive = false;
uint32_t flashStartedAt = 0;
bool ledSteady = false;

char commandBuffer[64];
size_t commandLength = 0;
bool commandOverflow = false;

int normalizedPot() {
  int value = constrain((int)(potFiltered + 0.5f), 0, 1023);
  if (value <= 3) value = 0;
  else if (value >= 1020) value = 1023;
  return REVERSE_POT ? 1023 - value : value;
}

void flashLed() {
  if (LED_FOLLOWS_POT || ledSteady) return;
  flashStartedAt = millis();
  flashActive = true;
}

void setLedSteady(bool on) {
  ledSteady = on;
  if (on) flashActive = false;
}

void updateLed() {
  if (flashActive &&
      (uint32_t)(millis() - flashStartedAt) >= LED_FLASH_MS) {
    flashActive = false;
  }

  const int brightness = LED_FOLLOWS_POT
    ? (int)map(potValue, 0, 1023, 0, 255)
    : (ledSteady || flashActive ? FLASH_BRIGHTNESS : 0);

  if (brightness != ledBrightness) {
    ledBrightness = brightness;
    analogWrite(LED_PIN, ledBrightness);
  }
}

void startBeep(unsigned int frequency, uint32_t durationMs) {
  noTone(PIEZO_PIN);
  tone(PIEZO_PIN, frequency);
  beepStartedAt = millis();
  beepDuration = durationMs;
  beeping = true;
}

void updateBuzzer() {
  if (beeping &&
      (uint32_t)(millis() - beepStartedAt) >= beepDuration) {
    noTone(PIEZO_PIN);
    digitalWrite(PIEZO_PIN, LOW);
    beeping = false;
  }
}

void emitReady() {
  if (Serial) Serial.println("ready,sound-map:single-led");
}

void emitPressure() {
  if (!Serial) return;
  Serial.print("pressure:");
  Serial.println((int)(fsrDisplay + 0.5f));
}

void emitPot() {
  if (!Serial) return;
  Serial.print("pot:");
  Serial.println(potValue);
}

void emitStatus() {
  if (!Serial) return;
  Serial.print("status,raw:");
  Serial.print(fsrRaw);
  Serial.print(",potraw:");
  Serial.print(potRaw);
  Serial.print(",pot:");
  Serial.print(potValue);
  Serial.print(",led:");
  Serial.print(ledBrightness);
  Serial.print(",pressed:");
  Serial.println(pressed ? 1 : 0);
}

void emitHit() {
  if (!Serial) return;
  const int level = constrain(
    (int)map(fsrRaw, PRESS_THRESHOLD, PRESS_FULL_SCALE, 1, 100),
    1, 100
  );
  Serial.print("hit,pressure:");
  Serial.print(fsrRaw);
  Serial.print(",level:");
  Serial.print(level);
  Serial.print(",pot:");
  Serial.println(potValue);
}

void updatePress(uint32_t now) {
  const int deviation = abs(fsrRaw - fsrBaseline);
  if (!pressed) {
    // Detect either wiring direction: pressing the FSR may raise or lower
    // the analog value depending on which side of the divider is grounded.
    if (deviation >= FSR_PRESS_DELTA) {
      if (highSamples < PRESS_CONFIRM_SAMPLES) ++highSamples;
      if (highSamples >= PRESS_CONFIRM_SAMPLES) {
        pressed = true;
        highSamples = 0;
        releasePending = false;

        if ((uint32_t)(now - lastHitAt) >= HIT_COOLDOWN_MS) {
          lastHitAt = now;
          startBeep(BEEP_HZ, HIT_BEEP_MS);
          flashLed();
          emitHit();
        }
      }
    } else {
      highSamples = 0;
      // Slowly follow the untouched sensor value so small drift does not
      // become a false hit.
      fsrBaseline += (fsrRaw - fsrBaseline) / 24;
    }
  } else {
    if (deviation <= FSR_RELEASE_DELTA) {
      if (!releasePending) {
        releasePending = true;
        releaseStartedAt = now;
      } else if ((uint32_t)(now - releaseStartedAt) >= RELEASE_CONFIRM_MS) {
        pressed = false;
        releasePending = false;
        highSamples = 0;
      }
    } else {
      releasePending = false;
    }
  }
}

void executeCommand(char *line) {
  while (*line && isspace((unsigned char)*line)) ++line;
  size_t length = strlen(line);
  while (length && isspace((unsigned char)line[length - 1])) {
    line[--length] = '\0';
  }
  if (!length) return;

  if (strcmp(line, "PING") == 0 || strcmp(line, "ping") == 0) {
    emitReady();
    emitPot();
  } else if (strcmp(line, "beep") == 0 || strcmp(line, "BEEP") == 0) {
    startBeep(BEEP_HZ, 500);
    if (Serial) Serial.println("ack,beep");
  } else if (strcmp(line, "status") == 0 || strcmp(line, "STATUS") == 0) {
    emitStatus();
  } else if (strcmp(line, "led:on") == 0 || strcmp(line, "LED_ON") == 0) {
    setLedSteady(true);
    if (Serial) Serial.println("ack,led:on");
  } else if (strcmp(line, "led:off") == 0 || strcmp(line, "LED_OFF") == 0) {
    setLedSteady(false);
    if (Serial) Serial.println("ack,led:off");
  } else if (strncmp(line, "color:", 6) == 0 || strcmp(line, "flash") == 0) {
    flashLed();
  } else {
    if (Serial) Serial.println("error,command:unknown");
  }
}

void handleCommands() {
  for (uint8_t n = 0; n < 32 && Serial.available() > 0; ++n) {
    const int value = Serial.read();
    if (value < 0) break;
    const char c = (char)value;

    if (c == '\n' || c == '\r') {
      if (!commandOverflow) {
        commandBuffer[commandLength] = '\0';
        executeCommand(commandBuffer);
      }
      commandLength = 0;
      commandOverflow = false;
    } else if (c == '\0') {
      commandOverflow = true;
    } else if (!commandOverflow) {
      if (commandLength < sizeof(commandBuffer) - 1) {
        commandBuffer[commandLength++] = c;
      } else {
        commandOverflow = true;
      }
    }
  }
}

void setup() {
  pinMode(FSR_PIN, INPUT);
  pinMode(POT_PIN, INPUT);
  pinMode(PIEZO_PIN, OUTPUT);
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(PIEZO_PIN, LOW);

#if defined(ARDUINO_ARCH_RENESAS) || defined(ARDUINO_ARCH_RENESAS_UNO)
  analogReadResolution(10);
  analogWriteResolution(8);
#endif

  Serial.begin(115200);
  fsrRaw = analogRead(FSR_PIN);
  potRaw = analogRead(POT_PIN);
  fsrDisplay = fsrRaw;
  fsrBaseline = fsrRaw;
  potFiltered = potRaw;
  potValue = normalizedPot();
  pressed = false;

  analogWrite(LED_PIN, 1);
  updateLed();

  const uint32_t now = millis();
  lastSampleAt = now;
  lastPressurePacket = now;
  lastPotPacket = now - POT_PACKET_MS;
  lastHitAt = now - HIT_COOLDOWN_MS;

  if (STARTUP_BEEP) startBeep(BEEP_HZ, 250);
  emitReady();
}

void loop() {
  uint32_t now = millis();

  if ((uint32_t)(now - lastSampleAt) >= SAMPLE_MS) {
    lastSampleAt = now;
    fsrRaw = analogRead(FSR_PIN);
    potRaw = analogRead(POT_PIN);
    fsrDisplay += 0.12f * (fsrRaw - fsrDisplay);
    potFiltered += 0.25f * (potRaw - potFiltered);
    potValue = normalizedPot();
    updatePress(now);
  }

  handleCommands();
  updateBuzzer();
  updateLed();

  now = millis();
  if ((uint32_t)(now - lastPressurePacket) >= PRESSURE_PACKET_MS) {
    lastPressurePacket = now;
    emitPressure();
  }
  if ((uint32_t)(now - lastPotPacket) >= POT_PACKET_MS) {
    lastPotPacket = now;
    emitPot();
  }
}
