#!/usr/bin/env python3
"""Mede a latência acústica entre duas trilhas WAV (Método A).

O celular toca um bipe de 1 kHz / 100 ms (botão "Tocar bipe de teste" no
app). O PC grava duas trilhas:

- **acústica**: microfone do PC apontado para o celular (o bipe chega
  pelo ar);
- **micshare**: entrada do Micshare (o mesmo bipe captado pelo celular e
  processado no PC).

O script detecta o onset (subida do envelope de energia) de cada bipe nas
duas trilhas e imprime o delta entre eles.

uso:
    python scripts/onset-diff.py ACUSTICA.wav MICSHARE.wav
    python scripts/onset-diff.py --selftest

Só usa a stdlib (`wave`, `array`, `math`).
"""

import array
import math
import os
import sys
import tempfile
import wave

# Janela da envoltória de energia (ms).
WINDOW_MS = 1.0

# Fração do pico que conta como onset.
THRESHOLD_RATIO = 0.2

# Onsets mais próximos que isso são considerados o mesmo bipe (ms).
MATCH_TOLERANCE_MS = 2_000.0

# Intervalo mínimo entre dois onsets na mesma trilha (ms).
MIN_GAP_MS = 200.0


def read_wav(path):
    """Lê um WAV PCM 16-bit e devolve (amostras mono, taxa).

    Canais são misturados (média) — o detector não precisa de estéreo.
    """
    with wave.open(path, "rb") as wav:
        if wav.getsampwidth() != 2:
            raise SystemExit(f"{path}: só PCM 16-bit é suportado")
        rate = wav.getframerate()
        channels = wav.getnchannels()
        frames = wav.readframes(wav.getnframes())

    samples = array.array("h")
    samples.frombytes(frames)
    if sys.byteorder == "big":
        samples.byteswap()

    if channels <= 1:
        return samples, rate

    mono = array.array("h")
    for i in range(0, len(samples) - channels + 1, channels):
        mono.append(sum(samples[i:i + channels]) // channels)
    return mono, rate


def envelope(samples, rate, window_ms=WINDOW_MS):
    """RMS por janela — devolve (valores, amostras_por_janela)."""
    window = max(1, int(rate * window_ms / 1000.0))
    values = []
    for start in range(0, len(samples), window):
        chunk = samples[start:start + window]
        if not chunk:
            break
        total = 0
        for sample in chunk:
            total += sample * sample
        values.append(math.sqrt(total / len(chunk)))
    return values, window


def find_onsets(values, rate, window, threshold_ratio=THRESHOLD_RATIO):
    """Instantes (ms) dos onsets: subida da envoltória acima do limiar."""
    if not values:
        return []

    peak = max(values)
    if peak <= 0:
        return []
    threshold = peak * threshold_ratio

    onsets = []
    last = -1e9
    index = 0
    while index < len(values):
        if values[index] < threshold:
            index += 1
            continue
        # Consome o bipe inteiro (envoltória acima de metade do limiar)
        # para não contar o ruído dentro dele.
        end = index
        while end < len(values) and values[end] >= threshold * 0.5:
            end += 1
        instant = index * window * 1000.0 / rate
        if instant - last >= MIN_GAP_MS:
            onsets.append(instant)
            last = instant
        index = end
    return onsets


def match(acoustic, micshare, tolerance=MATCH_TOLERANCE_MS):
    """Associa cada onset acústico ao onset do Micshare mais próximo."""
    remaining = list(micshare)
    deltas = []
    for onset in acoustic:
        if not remaining:
            break
        nearest = min(remaining, key=lambda candidate: abs(candidate - onset))
        if abs(nearest - onset) <= tolerance:
            deltas.append(nearest - onset)
            remaining.remove(nearest)
    return deltas


def percentile(values, pct):
    """Percentil (pct) dos valores."""
    if not values:
        return 0.0
    ordered = sorted(values)
    rank = max(1, math.ceil(len(ordered) * pct / 100.0)) - 1
    return ordered[min(rank, len(ordered) - 1)]


def write_wav(path, samples, rate):
    """Grava um WAV PCM 16-bit mono."""
    with wave.open(path, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(rate)
        wav.writeframes(samples.tobytes())


def synth_beep(rate, onset_ms, duration_ms=100, freq=1000.0, amplitude=0.33):
    """Bipe sintético com fade de 10 ms (evita clique)."""
    total = int(rate * (onset_ms + duration_ms) / 1000.0) + 1
    samples = array.array("h", [0]) * total
    start = int(rate * onset_ms / 1000.0)
    length = int(rate * duration_ms / 1000.0)
    fade = int(rate * 0.01)
    for i in range(length):
        gain = 1.0
        if i < fade:
            gain = i / fade
        elif i >= length - fade:
            gain = (length - 1 - i) / fade
        value = int(math.sin(2 * math.pi * freq * i / rate) * amplitude * 32767 * gain)
        samples[start + i] = max(-32768, min(32767, value))
    return samples


def selftest():
    """Duas WAVs sintéticas com delta conhecido → confere a medida."""
    rate = 48000
    delta_ms = 120.0
    with tempfile.TemporaryDirectory() as tmp:
        acoustic_path = os.path.join(tmp, "acustica.wav")
        micshare_path = os.path.join(tmp, "micshare.wav")

        write_wav(acoustic_path, synth_beep(rate, 200.0), rate)
        write_wav(micshare_path, synth_beep(rate, 200.0 + delta_ms), rate)

        acoustic, rate_a = read_wav(acoustic_path)
        micshare, rate_m = read_wav(micshare_path)
        assert rate_a == rate_m

        env_a, window_a = envelope(acoustic, rate_a)
        env_m, window_m = envelope(micshare, rate_m)
        onsets_a = find_onsets(env_a, rate_a, window_a)
        onsets_m = find_onsets(env_m, rate_m, window_m)

        assert len(onsets_a) == 1, f"onset acústico não detectado: {onsets_a}"
        assert len(onsets_m) == 1, f"onset do micshare não detectado: {onsets_m}"

        deltas = match(onsets_a, onsets_m)
        assert len(deltas) == 1, f"associação falhou: {deltas}"

        measured = deltas[0]
        error = abs(measured - delta_ms)
        assert error <= 5.0, f"delta medido {measured:.1f} ms (esperado {delta_ms} ms)"

    print(f"selftest ok: delta medido {measured:.1f} ms (esperado {delta_ms:.1f} ms)")


def main(argv):
    if "--selftest" in argv:
        selftest()
        return 0

    if len(argv) != 3:
        print(__doc__)
        return 1

    acoustic, rate_a = read_wav(argv[1])
    micshare, rate_m = read_wav(argv[2])
    if rate_a != rate_m:
        print(f"aviso: taxas diferentes ({rate_a} vs {rate_m} Hz)")

    env_a, window_a = envelope(acoustic, rate_a)
    env_m, window_m = envelope(micshare, rate_m)
    onsets_a = find_onsets(env_a, rate_a, window_a)
    onsets_m = find_onsets(env_m, rate_m, window_m)

    print(f"onsets acústicos: {len(onsets_a)}  |  onsets do micshare: {len(onsets_m)}")

    deltas = match(onsets_a, onsets_m)
    if not deltas:
        print("nenhum bipe associado entre as duas trilhas")
        return 1

    for index, delta in enumerate(deltas, start=1):
        print(f"  bipe {index}: {delta:+.1f} ms")

    media = sum(deltas) / len(deltas)
    print(f"média: {media:.1f} ms")
    print(f"p95:   {percentile(deltas, 95):.1f} ms")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
