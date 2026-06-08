#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import math
import shutil
import subprocess
import wave
from array import array
from dataclasses import dataclass
from pathlib import Path

SAMPLE_RATE = 44_100
BIT_RATE = "128k"
ROOM_LOOP_SECONDS = 18.0
MASTER_PEAK = 0.82


@dataclass(frozen=True)
class PackSpec:
    slug: str
    title: str
    description: str
    body: float
    air: float
    sparkle: float
    water: float
    rustle: float
    seed: int


PACKS: tuple[PackSpec, ...] = (
    PackSpec(
        slug="pack_a_crisp_pebble",
        title="A. Crisp Pebble",
        description="More tactile and crisp, with tiny plastic-glass transients.",
        body=0.58,
        air=0.42,
        sparkle=0.82,
        water=0.36,
        rustle=0.38,
        seed=101,
    ),
    PackSpec(
        slug="pack_b_velvet_brush",
        title="B. Velvet Brush",
        description="Softer finger texture with more paper, fabric, and plush feel.",
        body=0.80,
        air=0.25,
        sparkle=0.45,
        water=0.28,
        rustle=0.70,
        seed=202,
    ),
    PackSpec(
        slug="pack_c_dew_drop",
        title="C. Dew Drop",
        description="Rounder, wetter, and brighter, leaning toward bubble and dew cues.",
        body=0.50,
        air=0.56,
        sparkle=0.68,
        water=0.82,
        rustle=0.44,
        seed=303,
    ),
)

REQUESTED_VOLUMES = {
    "sound_click": 0.35,
    "sound_put": 0.40,
    "sound_drag": 0.25,
    "sound_fill": 0.30,
    "sound_unlock": 0.35,
    "sound_success": 0.40,
    "sound_ui": 0.30,
    "sound_wrong": 0.25,
    "bg_whitenoise1": 0.12,
    "bg_whitenoise2": 0.10,
}


def clamp(value: float, low: float, high: float) -> float:
    return low if value < low else high if value > high else value


def lcg_step(state: int) -> int:
    return (1664525 * state + 1013904223) & 0xFFFFFFFF


def rand_unit(state: int) -> tuple[int, float]:
    state = lcg_step(state)
    return state, ((state >> 8) & 0xFFFFFF) / 0xFFFFFF


def pan_gains(pan: float) -> tuple[float, float]:
    angle = (clamp(pan, -1.0, 1.0) + 1.0) * math.pi / 4.0
    return math.cos(angle), math.sin(angle)


def alloc_buffer(duration_sec: float) -> tuple[array, array]:
    sample_count = max(1, int(round(duration_sec * SAMPLE_RATE)))
    return array("f", [0.0]) * sample_count, array("f", [0.0]) * sample_count


def env_ar(progress: float, attack: float, release: float) -> float:
    if progress <= 0.0 or progress >= 1.0:
        return 0.0
    if progress < attack:
        return progress / attack if attack > 0 else 1.0
    if progress > 1.0 - release:
        tail = (1.0 - progress) / release if release > 0 else 0.0
        return max(0.0, tail)
    return 1.0


def add_tone(
    left: array,
    right: array,
    *,
    start: float,
    duration: float,
    start_freq: float,
    end_freq: float,
    amp: float,
    partials: tuple[tuple[float, float], ...],
    attack: float,
    release: float,
    pan: float,
    seed: int,
    noise_amt: float = 0.0,
    vibrato_hz: float = 0.0,
    vibrato_depth: float = 0.0,
) -> None:
    start_index = int(start * SAMPLE_RATE)
    sample_count = max(1, int(duration * SAMPLE_RATE))
    phases = [0.0 for _ in partials]
    l_gain, r_gain = pan_gains(pan)
    noise_lp = 0.0
    state = seed
    for offset in range(sample_count):
        index = start_index + offset
        if index >= len(left):
            break
        progress = offset / max(1, sample_count - 1)
        env = env_ar(progress, attack, release)
        freq = start_freq + (end_freq - start_freq) * progress
        if vibrato_hz > 0.0 and vibrato_depth > 0.0:
            t = offset / SAMPLE_RATE
            freq *= 1.0 + math.sin(2.0 * math.pi * vibrato_hz * t) * vibrato_depth
        sample = 0.0
        for part_idx, (ratio, strength) in enumerate(partials):
            phases[part_idx] += 2.0 * math.pi * freq * ratio / SAMPLE_RATE
            sample += math.sin(phases[part_idx]) * strength
        if noise_amt > 0.0:
            state, unit = rand_unit(state)
            white = unit * 2.0 - 1.0
            noise_lp += 0.18 * (white - noise_lp)
            sample += noise_lp * noise_amt
        sample *= amp * env
        left[index] += sample * l_gain
        right[index] += sample * r_gain


def add_band_noise(
    left: array,
    right: array,
    *,
    start: float,
    duration: float,
    amp: float,
    attack: float,
    release: float,
    pan_start: float,
    pan_end: float,
    seed: int,
    brightness: float,
    body: float,
) -> None:
    start_index = int(start * SAMPLE_RATE)
    sample_count = max(1, int(duration * SAMPLE_RATE))
    state = seed
    lp_fast = 0.0
    lp_slow = 0.0
    hp_lp = 0.0
    for offset in range(sample_count):
        index = start_index + offset
        if index >= len(left):
            break
        progress = offset / max(1, sample_count - 1)
        env = env_ar(progress, attack, release)
        state, unit = rand_unit(state)
        white = unit * 2.0 - 1.0
        alpha_fast = 0.13 + brightness * 0.22
        alpha_slow = 0.012 + body * 0.035
        alpha_hp = 0.004 + brightness * 0.02
        lp_fast += alpha_fast * (white - lp_fast)
        lp_slow += alpha_slow * (lp_fast - lp_slow)
        hp_lp += alpha_hp * (white - hp_lp)
        band = (lp_fast - lp_slow) * (0.75 + brightness * 0.45)
        air = (white - hp_lp) * (0.12 + brightness * 0.30)
        low = lp_slow * (0.30 + body * 0.45)
        sample = (band + air + low) * amp * env
        pan = pan_start + (pan_end - pan_start) * progress
        l_gain, r_gain = pan_gains(pan)
        left[index] += sample * l_gain
        right[index] += sample * r_gain


def add_bubble(
    left: array,
    right: array,
    *,
    start: float,
    duration: float,
    amp: float,
    start_freq: float,
    end_freq: float,
    pan: float,
    seed: int,
) -> None:
    add_tone(
        left,
        right,
        start=start,
        duration=duration,
        start_freq=start_freq,
        end_freq=end_freq,
        amp=amp,
        partials=((1.0, 1.0), (1.98, 0.22), (3.0, 0.08)),
        attack=0.04,
        release=0.42,
        pan=pan,
        seed=seed,
        noise_amt=0.03,
        vibrato_hz=4.5,
        vibrato_depth=0.006,
    )


def apply_master(left: array, right: array, target_peak: float) -> tuple[float, float]:
    peak = 0.0
    accum = 0.0
    for idx in range(len(left)):
        mixed_l = left[idx]
        mixed_r = right[idx]
        peak = max(peak, abs(mixed_l), abs(mixed_r))
        accum += mixed_l * mixed_l + mixed_r * mixed_r
    if peak < 1e-9:
        return 0.0, 0.0

    gain = min(MASTER_PEAK / peak, target_peak / peak)
    rms = math.sqrt(accum / max(1, len(left) * 2))
    if rms > 0.24:
        gain *= 0.24 / rms

    out_peak = 0.0
    out_accum = 0.0
    for idx in range(len(left)):
        mixed_l = math.tanh(left[idx] * gain * 1.15) / math.tanh(1.15)
        mixed_r = math.tanh(right[idx] * gain * 1.15) / math.tanh(1.15)
        left[idx] = mixed_l
        right[idx] = mixed_r
        out_peak = max(out_peak, abs(mixed_l), abs(mixed_r))
        out_accum += mixed_l * mixed_l + mixed_r * mixed_r
    out_rms = math.sqrt(out_accum / max(1, len(left) * 2))
    return out_peak, out_rms


def write_wav(path: Path, left: array, right: array) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as wav_file:
        wav_file.setnchannels(2)
        wav_file.setsampwidth(2)
        wav_file.setframerate(SAMPLE_RATE)
        frames = array("h")
        for idx in range(len(left)):
            frames.append(int(clamp(left[idx], -1.0, 1.0) * 32767))
            frames.append(int(clamp(right[idx], -1.0, 1.0) * 32767))
        wav_file.writeframes(frames.tobytes())


def encode_mp3(wav_path: Path, mp3_path: Path) -> None:
    subprocess.run(
        [
            shutil.which("ffmpeg") or "ffmpeg",
            "-y",
            "-loglevel",
            "error",
            "-i",
            str(wav_path),
            "-codec:a",
            "libmp3lame",
            "-b:a",
            BIT_RATE,
            "-ar",
            str(SAMPLE_RATE),
            "-ac",
            "2",
            str(mp3_path),
        ],
        check=True,
    )


def periodic_texture(length: int, duration: float, seed: int, start_k: int, end_k: int, slope: float) -> array:
    values = array("f", [0.0]) * length
    state = seed
    fundamental = 1.0 / duration
    for harmonic in range(start_k, end_k + 1):
        state, unit_a = rand_unit(state)
        state, unit_b = rand_unit(state)
        amp = (unit_a * 0.9 + 0.1) / (harmonic ** slope)
        phase = unit_b * 2.0 * math.pi
        freq = harmonic * fundamental
        step = 2.0 * math.pi * freq / SAMPLE_RATE
        angle = phase
        for idx in range(length):
            values[idx] += math.sin(angle) * amp
            angle += step
    peak = max(1e-9, max(abs(value) for value in values))
    for idx in range(length):
        values[idx] /= peak
    return values


def repeat_tile(tile: array, target_length: int) -> array:
    out = array("f", [0.0]) * target_length
    tile_len = len(tile)
    for idx in range(target_length):
        out[idx] = tile[idx % tile_len]
    return out


def wrap_distance(index: int, center: int, length: int) -> int:
    raw = abs(index - center)
    return min(raw, length - raw)


def gen_click(pack: PackSpec) -> tuple[array, array]:
    duration = 0.28 + pack.sparkle * 0.10
    left, right = alloc_buffer(duration)
    add_band_noise(
        left,
        right,
        start=0.0,
        duration=0.075,
        amp=0.34 + pack.air * 0.20,
        attack=0.01,
        release=0.74,
        pan_start=-0.08,
        pan_end=0.06,
        seed=pack.seed + 11,
        brightness=0.55 + pack.sparkle * 0.35,
        body=0.08 + pack.body * 0.12,
    )
    add_tone(
        left,
        right,
        start=0.0,
        duration=duration * 0.88,
        start_freq=960 + pack.sparkle * 540,
        end_freq=560 + pack.body * 140,
        amp=0.55 + pack.sparkle * 0.16,
        partials=((1.0, 1.0), (2.3, 0.26), (4.2, 0.10)),
        attack=0.01,
        release=0.62,
        pan=0.0,
        seed=pack.seed + 12,
        noise_amt=0.018 + pack.air * 0.02,
    )
    if pack.sparkle > 0.6:
        add_tone(
            left,
            right,
            start=0.05,
            duration=0.08,
            start_freq=1800,
            end_freq=1400,
            amp=0.10 + pack.sparkle * 0.08,
            partials=((1.0, 1.0), (2.0, 0.18)),
            attack=0.02,
            release=0.72,
            pan=0.18,
            seed=pack.seed + 13,
        )
    return left, right


def gen_put(pack: PackSpec) -> tuple[array, array]:
    duration = 0.38 + pack.body * 0.16
    left, right = alloc_buffer(duration)
    add_tone(
        left,
        right,
        start=0.0,
        duration=duration * 0.94,
        start_freq=430 + pack.body * 180,
        end_freq=220 + pack.body * 90,
        amp=0.64 + pack.body * 0.20,
        partials=((1.0, 1.0), (1.98, 0.34), (3.1, 0.12)),
        attack=0.01,
        release=0.56,
        pan=-0.03,
        seed=pack.seed + 21,
        noise_amt=0.025,
    )
    add_tone(
        left,
        right,
        start=0.015,
        duration=0.12,
        start_freq=1400 + pack.sparkle * 420,
        end_freq=950 + pack.sparkle * 210,
        amp=0.18 + pack.sparkle * 0.10,
        partials=((1.0, 1.0), (2.4, 0.24)),
        attack=0.01,
        release=0.70,
        pan=0.12,
        seed=pack.seed + 22,
    )
    add_band_noise(
        left,
        right,
        start=0.0,
        duration=0.08,
        amp=0.08 + pack.rustle * 0.04,
        attack=0.02,
        release=0.65,
        pan_start=0.04,
        pan_end=-0.06,
        seed=pack.seed + 23,
        brightness=0.55,
        body=0.22,
    )
    return left, right


def gen_drag(pack: PackSpec) -> tuple[array, array]:
    duration = 0.22 + pack.rustle * 0.14
    left, right = alloc_buffer(duration)
    add_band_noise(
        left,
        right,
        start=0.0,
        duration=duration,
        amp=0.24 + pack.rustle * 0.12,
        attack=0.06,
        release=0.20,
        pan_start=-0.22,
        pan_end=0.22,
        seed=pack.seed + 31,
        brightness=0.24 + pack.air * 0.32,
        body=0.36 + pack.body * 0.22,
    )
    add_tone(
        left,
        right,
        start=0.03,
        duration=duration * 0.62,
        start_freq=180 + pack.body * 60,
        end_freq=130 + pack.body * 45,
        amp=0.10 + pack.body * 0.06,
        partials=((1.0, 1.0), (2.0, 0.16)),
        attack=0.08,
        release=0.28,
        pan=0.0,
        seed=pack.seed + 32,
        noise_amt=0.015,
    )
    return left, right


def gen_fill(pack: PackSpec) -> tuple[array, array]:
    duration = 0.34 + pack.water * 0.24
    left, right = alloc_buffer(duration)
    add_bubble(
        left,
        right,
        start=0.0,
        duration=duration * 0.58,
        amp=0.42 + pack.water * 0.16,
        start_freq=420 + pack.water * 90,
        end_freq=820 + pack.sparkle * 160,
        pan=-0.05,
        seed=pack.seed + 41,
    )
    add_tone(
        left,
        right,
        start=duration * 0.16,
        duration=duration * 0.70,
        start_freq=900 + pack.sparkle * 180,
        end_freq=1320 + pack.water * 260,
        amp=0.28 + pack.sparkle * 0.10,
        partials=((1.0, 1.0), (2.0, 0.20), (3.0, 0.08)),
        attack=0.04,
        release=0.40,
        pan=0.08,
        seed=pack.seed + 42,
        vibrato_hz=5.4,
        vibrato_depth=0.005,
    )
    return left, right


def gen_unlock(pack: PackSpec) -> tuple[array, array]:
    duration = 0.42 + pack.sparkle * 0.24
    left, right = alloc_buffer(duration)
    notes = (
        (0.00, 820 + pack.sparkle * 140, 1180 + pack.sparkle * 180, -0.15),
        (0.11, 980 + pack.sparkle * 120, 1380 + pack.sparkle * 160, 0.12),
        (0.24, 1260 + pack.sparkle * 180, 1680 + pack.sparkle * 160, 0.04),
    )
    for idx, (start, base_a, base_b, pan) in enumerate(notes):
        add_tone(
            left,
            right,
            start=start,
            duration=max(0.16, duration - start),
            start_freq=base_a,
            end_freq=base_b,
            amp=0.23 + pack.sparkle * 0.12 - idx * 0.03,
            partials=((1.0, 1.0), (2.7, 0.30), (4.9, 0.12)),
            attack=0.03,
            release=0.50,
            pan=pan,
            seed=pack.seed + 51 + idx,
        )
    add_band_noise(
        left,
        right,
        start=0.02,
        duration=duration * 0.78,
        amp=0.05 + pack.air * 0.04,
        attack=0.06,
        release=0.24,
        pan_start=-0.18,
        pan_end=0.18,
        seed=pack.seed + 54,
        brightness=0.72,
        body=0.08,
    )
    return left, right


def gen_success(pack: PackSpec) -> tuple[array, array]:
    duration = 0.54 + pack.body * 0.22
    left, right = alloc_buffer(duration)
    motif = (
        (0.00, 520 + pack.body * 100, 660 + pack.sparkle * 110, -0.10),
        (0.12, 660 + pack.sparkle * 120, 860 + pack.sparkle * 140, 0.12),
        (0.26, 820 + pack.sparkle * 130, 1120 + pack.water * 180, 0.02),
    )
    for idx, (start, start_freq, end_freq, pan) in enumerate(motif):
        add_tone(
            left,
            right,
            start=start,
            duration=min(0.34, duration - start),
            start_freq=start_freq,
            end_freq=end_freq,
            amp=0.34 + pack.sparkle * 0.08,
            partials=((1.0, 1.0), (2.0, 0.22), (3.1, 0.10)),
            attack=0.03,
            release=0.42,
            pan=pan,
            seed=pack.seed + 61 + idx,
            noise_amt=0.015,
        )
    add_tone(
        left,
        right,
        start=0.06,
        duration=duration * 0.92,
        start_freq=260 + pack.body * 50,
        end_freq=220 + pack.body * 35,
        amp=0.16 + pack.body * 0.08,
        partials=((1.0, 1.0), (2.0, 0.18), (0.5, 0.20)),
        attack=0.14,
        release=0.36,
        pan=0.0,
        seed=pack.seed + 64,
        vibrato_hz=3.0,
        vibrato_depth=0.004,
    )
    return left, right


def gen_ui(pack: PackSpec) -> tuple[array, array]:
    duration = 0.24 + pack.rustle * 0.12
    left, right = alloc_buffer(duration)
    add_band_noise(
        left,
        right,
        start=0.0,
        duration=duration,
        amp=0.18 + pack.rustle * 0.10,
        attack=0.03,
        release=0.30,
        pan_start=-0.20,
        pan_end=0.12,
        seed=pack.seed + 71,
        brightness=0.24 + pack.air * 0.20,
        body=0.18 + pack.body * 0.12,
    )
    add_tone(
        left,
        right,
        start=0.04,
        duration=duration * 0.54,
        start_freq=720 + pack.sparkle * 220,
        end_freq=540 + pack.body * 90,
        amp=0.18 + pack.sparkle * 0.06,
        partials=((1.0, 1.0), (2.0, 0.20)),
        attack=0.04,
        release=0.54,
        pan=0.05,
        seed=pack.seed + 72,
    )
    return left, right


def gen_wrong(pack: PackSpec) -> tuple[array, array]:
    duration = 0.22 + pack.body * 0.12
    left, right = alloc_buffer(duration)
    add_tone(
        left,
        right,
        start=0.0,
        duration=duration,
        start_freq=280 - pack.body * 40,
        end_freq=180 - pack.body * 20,
        amp=0.28 + pack.body * 0.08,
        partials=((1.0, 1.0), (2.1, 0.18), (3.0, 0.07)),
        attack=0.03,
        release=0.38,
        pan=-0.04,
        seed=pack.seed + 81,
        noise_amt=0.02,
    )
    add_band_noise(
        left,
        right,
        start=0.0,
        duration=0.08,
        amp=0.06,
        attack=0.03,
        release=0.56,
        pan_start=0.02,
        pan_end=-0.08,
        seed=pack.seed + 82,
        brightness=0.10,
        body=0.44,
    )
    return left, right


def gen_bg_whitenoise1(pack: PackSpec) -> tuple[array, array]:
    duration = ROOM_LOOP_SECONDS
    left, right = alloc_buffer(duration)
    sample_count = len(left)
    tile_duration = 3.0
    tile_length = int(tile_duration * SAMPLE_RATE)
    texture_low = repeat_tile(periodic_texture(tile_length, tile_duration, pack.seed + 91, 3, 18, 0.42), sample_count)
    texture_air = repeat_tile(periodic_texture(tile_length, tile_duration, pack.seed + 92, 28, 88, 0.58), sample_count)
    texture_mid = repeat_tile(periodic_texture(tile_length, tile_duration, pack.seed + 93, 10, 42, 0.48), sample_count)
    for idx in range(sample_count):
        t = idx / sample_count
        sway = 0.92 + 0.08 * math.sin(2.0 * math.pi * t * 2.0)
        room = (
            texture_low[idx] * (0.12 + pack.body * 0.08)
            + texture_mid[idx] * (0.10 + pack.rustle * 0.03)
            + texture_air[idx] * (0.04 + pack.air * 0.04)
        ) * sway
        side = texture_air[idx] * 0.018
        left[idx] = room - side
        right[idx] = room + side
    return left, right


def gen_bg_whitenoise2(pack: PackSpec) -> tuple[array, array]:
    duration = ROOM_LOOP_SECONDS
    left, right = alloc_buffer(duration)
    sample_count = len(left)
    tile_duration = 3.0
    tile_length = int(tile_duration * SAMPLE_RATE)
    rain_bed = repeat_tile(periodic_texture(tile_length, tile_duration, pack.seed + 101, 24, 110, 0.40), sample_count)
    mist = repeat_tile(periodic_texture(tile_length, tile_duration, pack.seed + 102, 6, 28, 0.60), sample_count)
    drops_tile = array("f", [0.0]) * tile_length
    state = pack.seed + 103
    droplet_count = 36
    for _ in range(droplet_count):
        state, unit_time = rand_unit(state)
        state, unit_amp = rand_unit(state)
        center = int(unit_time * tile_length)
        width = 160 + int(unit_amp * 180)
        amp = 0.10 + unit_amp * 0.12
        for delta in range(-width, width + 1):
            idx = (center + delta) % tile_length
            distance = abs(delta)
            window = 0.5 + 0.5 * math.cos(math.pi * distance / width)
            drops_tile[idx] += math.sin(distance / max(8.0, width * 0.12)) * amp * window
    peak = max(1e-9, max(abs(value) for value in drops_tile))
    for idx in range(tile_length):
        drops_tile[idx] /= peak
    drops = repeat_tile(drops_tile, sample_count)
    for idx in range(sample_count):
        sample = (
            rain_bed[idx] * (0.08 + pack.air * 0.05)
            + mist[idx] * (0.05 + pack.body * 0.02)
            + drops[idx] * (0.012 + pack.water * 0.010)
        )
        stereo = rain_bed[idx] * 0.02
        left[idx] = sample - stereo
        right[idx] = sample + stereo
    return left, right


GENERATORS = {
    "sound_click": gen_click,
    "sound_put": gen_put,
    "sound_drag": gen_drag,
    "sound_fill": gen_fill,
    "sound_unlock": gen_unlock,
    "sound_success": gen_success,
    "sound_ui": gen_ui,
    "sound_wrong": gen_wrong,
    "bg_whitenoise1": gen_bg_whitenoise1,
    "bg_whitenoise2": gen_bg_whitenoise2,
}

TARGET_PEAKS = {
    "sound_click": 0.74,
    "sound_put": 0.78,
    "sound_drag": 0.48,
    "sound_fill": 0.68,
    "sound_unlock": 0.70,
    "sound_success": 0.76,
    "sound_ui": 0.58,
    "sound_wrong": 0.50,
    "bg_whitenoise1": 0.24,
    "bg_whitenoise2": 0.22,
}


def build_candidate_pack(pack: PackSpec, pack_dir: Path) -> dict:
    pack_dir.mkdir(parents=True, exist_ok=True)
    manifest_items: list[dict] = []
    for name, generator in GENERATORS.items():
        left, right = generator(pack)
        peak, rms = apply_master(left, right, TARGET_PEAKS[name])
        wav_path = pack_dir / f"{name}.wav"
        mp3_path = pack_dir / f"{name}.mp3"
        write_wav(wav_path, left, right)
        encode_mp3(wav_path, mp3_path)
        wav_path.unlink()
        manifest_items.append(
            {
                "name": name,
                "file": mp3_path.name,
                "durationSec": round(len(left) / SAMPLE_RATE, 3),
                "sampleRate": SAMPLE_RATE,
                "bitRate": BIT_RATE,
                "recommendedVolume": REQUESTED_VOLUMES[name],
                "measuredPeak": round(peak, 4),
                "measuredRms": round(rms, 4),
                "loop": name.startswith("bg_"),
            }
        )
    return {
        "slug": pack.slug,
        "title": pack.title,
        "description": pack.description,
        "files": manifest_items,
    }


def write_readme(output_dir: Path, manifests: list[dict]) -> None:
    lines = [
        "# ASMR Audio Candidates",
        "",
        "Three full candidate packs generated for comparison.",
        "",
        "## Quick Audition",
        "",
        "Use `afplay /absolute/path/to/file.mp3` for single clips.",
        "For example: `afplay ./pack_a_crisp_pebble/sound_click.mp3` from this directory.",
        "",
        "## Packs",
        "",
    ]
    for manifest in manifests:
        lines.append(f"### {manifest['title']}")
        lines.append("")
        lines.append(manifest["description"])
        lines.append("")
        for item in manifest["files"]:
            lines.append(
                f"- `{manifest['slug']}/{item['file']}`  {item['durationSec']}s  "
                f"vol={item['recommendedVolume']}  peak={item['measuredPeak']}"
            )
        lines.append("")
    (output_dir / "README.md").write_text("\n".join(lines), encoding="utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate ASMR SFX candidate packs.")
    parser.add_argument(
        "--output-dir",
        default="artifacts/audio_candidates/asmr_20260517",
        help="Directory to write candidate packs into.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    manifests: list[dict] = []
    for pack in PACKS:
        manifests.append(build_candidate_pack(pack, output_dir / pack.slug))
    manifest_path = output_dir / "manifest.json"
    manifest_path.write_text(
        json.dumps(
            {
                "sampleRate": SAMPLE_RATE,
                "bitRate": BIT_RATE,
                "packs": manifests,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    write_readme(output_dir, manifests)
    print(f"Wrote ASMR audio candidates to {output_dir}")


if __name__ == "__main__":
    main()
