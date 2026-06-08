#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import math
import wave
from array import array
from dataclasses import dataclass
from pathlib import Path

SAMPLE_RATE = 24000
FADE_IN_SECONDS = 1.0
FADE_OUT_SECONDS = 2.2
MASTER_TARGET = 0.82
MAJOR_PENTATONIC = (0, 2, 4, 7, 9)


@dataclass(frozen=True)
class Event:
    instrument: str
    start: float
    duration: float
    midi: int
    amp: float
    pan: float = 0.0


@dataclass(frozen=True)
class TrackSpec:
    slug: str
    title: str
    bpm: int
    bars: int
    root_midi: int
    progression: tuple[int, ...]
    summary: str


def midi_to_freq(midi: float) -> float:
    return 440.0 * (2.0 ** ((midi - 69.0) / 12.0))


def degree_to_midi(root_midi: int, degree: int, scale: tuple[int, ...] = MAJOR_PENTATONIC) -> int:
    octave, index = divmod(degree, len(scale))
    return root_midi + scale[index] + 12 * octave


def pan_gains(pan: float) -> tuple[float, float]:
    clamped = max(-1.0, min(1.0, pan))
    angle = (clamped + 1.0) * math.pi / 4.0
    return math.cos(angle), math.sin(angle)


def smooth_env(pos: int, total: int, attack: float, release: float) -> float:
    if total <= 1:
        return 0.0
    progress = pos / total
    if progress < attack:
        return progress / attack if attack > 0 else 1.0
    if progress > 1.0 - release:
        tail = (1.0 - progress) / release if release > 0 else 0.0
        return max(0.0, tail)
    return 1.0


def lcg_step(state: int) -> int:
    return (1664525 * state + 1013904223) & 0xFFFFFFFF


def add_note(left: array, right: array, start: float, duration: float, midi: int, amp: float, pan: float, instrument: str, seed: int) -> None:
    freq = midi_to_freq(midi)
    start_index = int(start * SAMPLE_RATE)
    sample_count = max(1, int(duration * SAMPLE_RATE))
    l_gain, r_gain = pan_gains(pan)

    if instrument == "pluck":
        period = max(2, int(SAMPLE_RATE / freq))
        state = seed or (midi * 971 + start_index)
        ring = [0.0] * period
        for i in range(period):
            state = lcg_step(state)
            ring[i] = (((state >> 16) / 65535.0) * 2.0 - 1.0) * 0.9
        cursor = 0
        phase = 0.0
        phase_step = 2.0 * math.pi * freq / SAMPLE_RATE
        decay = 0.9972 - min(0.00045, freq / 1_800_000.0)
        shimmer = 0.09 if freq < 600 else 0.06
        attack_samples = max(12, int(0.004 * SAMPLE_RATE))
        for offset in range(sample_count):
            index = start_index + offset
            if index >= len(left):
                break
            env = math.exp(-4.8 * offset / sample_count)
            if offset < attack_samples:
                env *= offset / attack_samples
            current = ring[cursor]
            nxt = 0.5 * (current + ring[(cursor + 1) % period]) * decay
            ring[cursor] = nxt
            cursor = (cursor + 1) % period
            phase += phase_step
            tone = (current * 0.92 + nxt * 0.18 + math.sin(phase) * shimmer) * env * amp
            left[index] += tone * l_gain
            right[index] += tone * r_gain
        return

    if instrument == "flute":
        phase = 0.0
        attack = max(0.08, min(0.18, duration * 0.25))
        release = max(0.12, min(0.2, duration * 0.22))
        state = seed or (midi * 31337 + start_index)
        for offset in range(sample_count):
            index = start_index + offset
            if index >= len(left):
                break
            t = offset / SAMPLE_RATE
            env = smooth_env(offset, sample_count, attack / duration, release / duration)
            vib = math.sin(2.0 * math.pi * 5.2 * t) * 0.012
            phase += 2.0 * math.pi * freq * (1.0 + vib) / SAMPLE_RATE
            state = lcg_step(state)
            noise = (((state >> 16) / 65535.0) * 2.0 - 1.0) * 0.018 * math.exp(-2.8 * t)
            tone = (
                math.sin(phase)
                + 0.28 * math.sin(phase * 2.0 + 0.15)
                + 0.10 * math.sin(phase * 3.0 + 0.4)
                + noise
            ) * env * amp * 0.78
            left[index] += tone * l_gain
            right[index] += tone * r_gain
        return

    if instrument == "pad":
        phase_a = 0.0
        phase_b = 0.0
        phase_c = 0.0
        detune_up = 2.0 ** (4.0 / 1200.0)
        detune_down = 2.0 ** (-5.0 / 1200.0)
        attack = max(0.35, min(0.8, duration * 0.28))
        release = max(0.45, min(1.0, duration * 0.35))
        for offset in range(sample_count):
            index = start_index + offset
            if index >= len(left):
                break
            t = offset / SAMPLE_RATE
            env = smooth_env(offset, sample_count, attack / duration, release / duration)
            wobble = 1.0 + math.sin(2.0 * math.pi * 0.18 * t) * 0.0025
            phase_a += 2.0 * math.pi * freq * wobble / SAMPLE_RATE
            phase_b += 2.0 * math.pi * freq * detune_up / SAMPLE_RATE
            phase_c += 2.0 * math.pi * freq * detune_down / SAMPLE_RATE
            tone = (
                0.62 * math.sin(phase_a)
                + 0.24 * math.sin(phase_b)
                + 0.21 * math.sin(phase_c)
                + 0.16 * math.sin(phase_a * 0.5)
            ) * env * amp * 0.55
            left[index] += tone * l_gain
            right[index] += tone * r_gain
        return

    if instrument == "drone":
        phase = 0.0
        phase_2 = 0.0
        phase_3 = 0.0
        attack = max(0.04, min(0.12, duration * 0.08))
        release = max(0.18, min(0.35, duration * 0.12))
        for offset in range(sample_count):
            index = start_index + offset
            if index >= len(left):
                break
            t = offset / SAMPLE_RATE
            env = smooth_env(offset, sample_count, attack / duration, release / duration)
            bow = 0.84 + 0.16 * math.sin(2.0 * math.pi * 0.6 * t)
            phase += 2.0 * math.pi * freq / SAMPLE_RATE
            phase_2 += 2.0 * math.pi * freq * 2.0 / SAMPLE_RATE
            phase_3 += 2.0 * math.pi * freq * 3.0 / SAMPLE_RATE
            tone = (
                0.80 * math.sin(phase)
                + 0.22 * math.sin(phase_2 + 0.1)
                + 0.08 * math.sin(phase_3 + 0.4)
            ) * env * bow * amp * 0.5
            left[index] += tone * l_gain
            right[index] += tone * r_gain
        return

    if instrument == "bell":
        phase = 0.0
        partials = (
            (1.0, 1.00, 3.6),
            (2.12, 0.42, 5.1),
            (3.76, 0.23, 7.2),
            (5.41, 0.11, 9.0),
        )
        for offset in range(sample_count):
            index = start_index + offset
            if index >= len(left):
                break
            t = offset / SAMPLE_RATE
            phase += 2.0 * math.pi * freq / SAMPLE_RATE
            env = math.exp(-4.5 * t / max(duration, 0.001))
            tone = 0.0
            for ratio, strength, decay in partials:
                tone += math.sin(phase * ratio) * strength * math.exp(-decay * t)
            tone *= env * amp * 0.48
            left[index] += tone * l_gain
            right[index] += tone * r_gain
        return

    if instrument == "wood":
        phase = 0.0
        state = seed or (midi * 1717 + start_index)
        for offset in range(sample_count):
            index = start_index + offset
            if index >= len(left):
                break
            t = offset / SAMPLE_RATE
            env = math.exp(-26.0 * t)
            phase += 2.0 * math.pi * max(500.0, freq * 2.0) / SAMPLE_RATE
            state = lcg_step(state)
            noise = (((state >> 16) / 65535.0) * 2.0 - 1.0) * 0.4
            tone = (0.65 * math.sin(phase) + 0.35 * noise) * env * amp * 0.3
            left[index] += tone * l_gain
            right[index] += tone * r_gain
        return

    raise ValueError(f"Unknown instrument: {instrument}")


def apply_reverbish(left: array, right: array) -> None:
    taps = (
        (0.17, 0.16, 0.10),
        (0.31, 0.10, -0.08),
        (0.49, 0.07, 0.04),
    )
    length = len(left)
    for delay_seconds, gain, cross in taps:
        offset = int(delay_seconds * SAMPLE_RATE)
        for index in range(offset, length):
            prev_l = left[index - offset]
            prev_r = right[index - offset]
            left[index] += prev_l * gain + prev_r * gain * cross
            right[index] += prev_r * gain - prev_l * gain * cross


def apply_tone_shaping(left: array, right: array) -> None:
    prev_l = 0.0
    prev_r = 0.0
    alpha = 0.18
    for index in range(len(left)):
        prev_l += alpha * (left[index] - prev_l)
        prev_r += alpha * (right[index] - prev_r)
        left[index] = left[index] * 0.86 + prev_l * 0.14
        right[index] = right[index] * 0.86 + prev_r * 0.14


def apply_fades(left: array, right: array) -> None:
    fade_in = int(FADE_IN_SECONDS * SAMPLE_RATE)
    fade_out = int(FADE_OUT_SECONDS * SAMPLE_RATE)
    length = len(left)
    for index in range(min(fade_in, length)):
        factor = index / max(1, fade_in)
        left[index] *= factor
        right[index] *= factor
    for index in range(min(fade_out, length)):
        pos = length - 1 - index
        factor = index / max(1, fade_out)
        left[pos] *= factor
        right[pos] *= factor


def normalize(left: array, right: array) -> float:
    peak = max(max(abs(sample) for sample in left), max(abs(sample) for sample in right), 1e-9)
    scale = MASTER_TARGET / peak
    for index in range(len(left)):
        left[index] = math.tanh(left[index] * scale * 1.12) / 1.05
        right[index] = math.tanh(right[index] * scale * 1.12) / 1.05
    peak_after = max(max(abs(sample) for sample in left), max(abs(sample) for sample in right), 1e-9)
    return peak_after


def write_wave(path: Path, left: array, right: array) -> None:
    pcm = array("h")
    for l_sample, r_sample in zip(left, right):
        pcm.append(int(max(-1.0, min(1.0, l_sample)) * 32767))
        pcm.append(int(max(-1.0, min(1.0, r_sample)) * 32767))
    with wave.open(str(path), "wb") as wav_file:
        wav_file.setnchannels(2)
        wav_file.setsampwidth(2)
        wav_file.setframerate(SAMPLE_RATE)
        wav_file.writeframes(pcm.tobytes())


def compose_serene_mountain() -> tuple[TrackSpec, list[Event]]:
    spec = TrackSpec(
        slug="bgm_option_1_serene_mountain",
        title="Option 1 - Serene Mountain",
        bpm=72,
        bars=16,
        root_midi=55,
        progression=(0, 0, 7, 5, 0, 0, 7, 9, 5, 7, 0, 0, 7, 5, 0, 0),
        summary="Most restrained version: airy flute, soft guqin-like plucks, slow drifting bed.",
    )
    beat = 60.0 / spec.bpm
    bar_len = beat * 4.0
    events: list[Event] = []
    arp_pattern = (0, 2, 4, 2, 0, 2, 4, 5)
    melody_patterns = (
        ((0.0, 4, 1.5), (2.0, 5, 1.0), (3.25, 2, 0.55)),
        ((0.5, 1, 1.0), (2.0, 2, 0.8), (2.9, 4, 1.0)),
        ((0.0, 5, 1.8), (2.5, 4, 0.8), (3.3, 2, 0.55)),
        ((1.0, 2, 0.95), (2.2, 1, 0.75), (3.0, 0, 0.75)),
    )
    for bar in range(spec.bars):
        bar_root = spec.root_midi + spec.progression[bar]
        bar_start = bar * bar_len
        if bar % 2 == 0:
            low_root = bar_root - 12
            for midi, amp, pan in (
                (low_root, 0.22, -0.12),
                (low_root + 7, 0.12, 0.12),
                (low_root + 12, 0.08, 0.02),
            ):
                events.append(Event("pad", bar_start, bar_len * 2.0, midi, amp, pan))
        events.append(Event("drone", bar_start, bar_len * 1.85, bar_root - 12, 0.18, -0.05))
        for step, degree in enumerate(arp_pattern):
            start = bar_start + step * beat * 0.5
            midi = degree_to_midi(bar_root, degree) + 12
            events.append(Event("pluck", start, beat * 0.78, midi, 0.16, -0.15 + (step % 3) * 0.1))
            if step in (2, 6):
                events.append(Event("pluck", start + beat * 0.12, beat * 0.52, midi + 12, 0.05, 0.15))
        for note_start, degree, note_len in melody_patterns[bar % len(melody_patterns)]:
            if bar in (3, 7, 11, 15) and note_start < 1.0:
                continue
            midi = degree_to_midi(bar_root, degree) + 19
            events.append(Event("flute", bar_start + note_start * beat, note_len * beat, midi, 0.18, 0.08))
        if bar % 2 == 1:
            accent = degree_to_midi(bar_root, 4) + 24
            events.append(Event("bell", bar_start + bar_len - beat * 0.35, beat * 1.2, accent, 0.08, 0.2))
    return spec, events


def compose_bamboo_breeze() -> tuple[TrackSpec, list[Event]]:
    spec = TrackSpec(
        slug="bgm_option_2_bamboo_breeze",
        title="Option 2 - Bamboo Breeze",
        bpm=84,
        bars=16,
        root_midi=50,
        progression=(0, 7, 5, 0, 0, 7, 9, 7, 5, 0, 7, 5, 0, 7, 5, 0),
        summary="Brighter and more playful: stronger ostinato, light wood taps, quicker flute phrases.",
    )
    beat = 60.0 / spec.bpm
    bar_len = beat * 4.0
    events: list[Event] = []
    ostinato = (0, 2, 4, 2, 5, 4, 2, 0)
    melody_patterns = (
        ((0.0, 4, 0.75), (1.0, 5, 0.65), (2.0, 4, 0.75), (3.0, 2, 0.55)),
        ((0.5, 1, 0.6), (1.25, 2, 0.55), (2.0, 4, 0.8), (3.0, 5, 0.7)),
        ((0.0, 5, 0.85), (1.0, 7, 0.55), (2.0, 5, 0.65), (2.8, 4, 0.55)),
        ((0.0, 2, 0.7), (1.0, 1, 0.55), (2.0, 2, 0.55), (3.0, 0, 0.75)),
    )
    for bar in range(spec.bars):
        bar_root = spec.root_midi + spec.progression[bar]
        bar_start = bar * bar_len
        if bar % 4 == 0:
            low_root = bar_root - 12
            for midi, amp, pan in (
                (low_root, 0.16, -0.08),
                (low_root + 7, 0.09, 0.1),
            ):
                events.append(Event("pad", bar_start, bar_len * 4.0, midi, amp, pan))
        events.append(Event("drone", bar_start, bar_len * 1.3, bar_root - 12, 0.11, -0.1))
        for hit in (0.0, 2.0):
            events.append(Event("wood", bar_start + hit * beat, 0.18, bar_root + 12, 0.24, -0.05 if hit == 0 else 0.05))
        events.append(Event("wood", bar_start + 3.45 * beat, 0.12, bar_root + 19, 0.11, 0.1))
        for step, degree in enumerate(ostinato):
            start = bar_start + step * beat * 0.5
            midi = degree_to_midi(bar_root, degree) + 12
            amp = 0.18 if step in (0, 4) else 0.15
            pan = -0.18 if step % 2 == 0 else 0.18
            events.append(Event("pluck", start, beat * 0.62, midi, amp, pan))
            if step in (1, 5):
                events.append(Event("pluck", start + beat * 0.14, beat * 0.4, midi + 12, 0.045, -pan * 0.6))
        for bass_beat, degree in ((0.0, 0), (2.0, 4)):
            events.append(Event("pluck", bar_start + bass_beat * beat, beat * 0.72, degree_to_midi(bar_root - 12, degree), 0.12, -0.02))
        for note_start, degree, note_len in melody_patterns[bar % len(melody_patterns)]:
            midi = degree_to_midi(bar_root, degree) + 21
            events.append(Event("flute", bar_start + note_start * beat, note_len * beat, midi, 0.17, 0.1))
        if bar % 4 == 3:
            accent = degree_to_midi(bar_root, 5) + 24
            events.append(Event("bell", bar_start + bar_len - beat * 0.2, beat * 0.9, accent, 0.07, 0.15))
    return spec, events


def compose_warm_autumn() -> tuple[TrackSpec, list[Event]]:
    spec = TrackSpec(
        slug="bgm_option_3_warm_autumn",
        title="Option 3 - Warm Autumn",
        bpm=78,
        bars=16,
        root_midi=48,
        progression=(0, 5, 0, 7, 9, 5, 0, 0, 0, 5, 9, 7, 5, 0, 7, 0),
        summary="Warmest and most rounded: bell-like dulcimer strikes, steady low bed, fewer melodic edges.",
    )
    beat = 60.0 / spec.bpm
    bar_len = beat * 4.0
    events: list[Event] = []
    bell_pattern = (0, 2, 4, 2)
    melody_patterns = (
        ((0.0, 4, 1.7), (2.0, 5, 1.0)),
        ((0.5, 2, 1.1), (2.25, 1, 0.9)),
        ((0.0, 5, 1.8), (2.4, 4, 0.9)),
        ((1.0, 2, 1.0), (2.5, 0, 1.1)),
    )
    for bar in range(spec.bars):
        bar_root = spec.root_midi + spec.progression[bar]
        bar_start = bar * bar_len
        if bar % 2 == 0:
            low_root = bar_root - 12
            for midi, amp, pan in (
                (low_root, 0.19, -0.05),
                (low_root + 7, 0.09, 0.1),
                (low_root + 12, 0.07, 0.04),
            ):
                events.append(Event("pad", bar_start, bar_len * 2.0, midi, amp, pan))
        events.append(Event("drone", bar_start, bar_len * 1.9, bar_root - 12, 0.14, -0.04))
        if bar % 2 == 0:
            events.append(Event("wood", bar_start, 0.15, bar_root + 7, 0.12, -0.08))
        for step, degree in enumerate(bell_pattern):
            start = bar_start + step * beat
            midi = degree_to_midi(bar_root, degree) + 19
            amp = 0.11 if step == 0 else 0.085
            pan = -0.1 if step % 2 == 0 else 0.1
            events.append(Event("bell", start, beat * 0.95, midi, amp, pan))
            if step == 1:
                events.append(Event("pluck", start + beat * 0.15, beat * 0.55, midi + 12, 0.04, 0.15))
        for note_start, degree, note_len in melody_patterns[bar % len(melody_patterns)]:
            if bar in (6, 7, 14, 15) and note_start == 0.0:
                continue
            midi = degree_to_midi(bar_root, degree) + 17
            events.append(Event("flute", bar_start + note_start * beat, note_len * beat, midi, 0.14, 0.02))
    return spec, events


def render(spec: TrackSpec, events: list[Event], output_dir: Path) -> dict[str, object]:
    beat = 60.0 / spec.bpm
    total_seconds = spec.bars * beat * 4.0 + FADE_OUT_SECONDS + 1.0
    total_samples = int(total_seconds * SAMPLE_RATE)
    left = array("f", [0.0]) * total_samples
    right = array("f", [0.0]) * total_samples
    for idx, event in enumerate(events):
        add_note(
            left=left,
            right=right,
            start=event.start,
            duration=event.duration,
            midi=event.midi,
            amp=event.amp,
            pan=event.pan,
            instrument=event.instrument,
            seed=spec.root_midi * 1000 + idx * 97,
        )
    apply_reverbish(left, right)
    apply_tone_shaping(left, right)
    apply_fades(left, right)
    peak = normalize(left, right)
    output_path = output_dir / f"{spec.slug}.wav"
    write_wave(output_path, left, right)
    return {
        "file": str(output_path),
        "title": spec.title,
        "summary": spec.summary,
        "duration_seconds": round(total_seconds, 2),
        "bpm": spec.bpm,
        "peak": round(peak, 4),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate three local BGM candidates for the puzzle game.")
    parser.add_argument(
        "--output-dir",
        default="audio-candidates",
        help="Directory to write generated .wav files into.",
    )
    args = parser.parse_args()

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    tracks = [
        compose_serene_mountain(),
        compose_bamboo_breeze(),
        compose_warm_autumn(),
    ]

    manifest = {
        "sample_rate": SAMPLE_RATE,
        "tracks": [render(spec, events, output_dir) for spec, events in tracks],
    }
    manifest_path = output_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
