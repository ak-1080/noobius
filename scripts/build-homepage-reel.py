"""Rebuild the silent homepage edit from the owner's original Flow exports."""
import argparse
import subprocess
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--ffmpeg', required=True)
parser.add_argument('--source-dir', type=Path, required=True)
parser.add_argument('--variant', choices=['desktop', 'mobile', 'both'], default='both')
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
assets = root / 'public' / 'assets'
shots = [
    (assets / 'noobius-intro.mp4', 0.0, 3.5),
    (args.source_dir / 'Character_disconnecting_network_…_1080p_202609071626.mp4', 0.75, 7.5),
    (args.source_dir / 'Character_running_down_server_aisle_202609071630.mp4', 1.0, 4.5),
    (args.source_dir / 'Character_pressing_server_button_1080p_202609071628.mp4', 1.5, 7.75),
]
for source, _, _ in shots:
    if not source.is_file():
        raise SystemExit(f'Missing original: {source}')

# Append the opening half-second, dissolve back into it, then remove that same
# half-second from the start. The native loop crosses adjacent source frames.
# Each portrait shot follows the character, rather than cropping the entire
# assembled film around a single point that loses him at the server terminal.
focus = [0.62, 0.60, 0.50, 0.70, 0.62]
variants = ['desktop', 'mobile'] if args.variant == 'both' else [args.variant]
for variant in variants:
    inputs = []
    filters = []
    for i, (source, start, end) in enumerate(shots + [(shots[0][0], 0, 0.5)]):
        inputs += ['-ss', str(start), '-t', str(end - start), '-i', str(source)]
        crop = f',crop=608:1080:{int((1920 * focus[i] - 304) / 2) * 2}:0' if variant == 'mobile' else ''
        filters.append(f'[{i}:v]setpts=PTS-STARTPTS,fps=24,scale=1920:1080:flags=lanczos{crop},setsar=1,format=yuv420p,settb=1/24[v{i}]')
    end_at = shots[0][2] - shots[0][1]
    previous = 'v0'
    for i in range(1, 5):
        offset = end_at - 0.5
        filters.append(f'[{previous}][v{i}]xfade=transition=fade:duration=0.5:offset={offset}[join{i}]')
        duration = shots[i][2] - shots[i][1] if i < 4 else 0.5
        end_at += duration - 0.5
        previous = f'join{i}'
    filters.append(f'[{previous}]trim=start=0.5,setpts=PTS-STARTPTS,format=yuv420p[out]')
    suffix = '-mobile' if variant == 'mobile' else ''
    output = assets / f'noobius-night-shift-reel{suffix}.mp4'
    subprocess.run([
        args.ffmpeg, '-hide_banner', '-loglevel', 'warning', '-y',
        '-filter_complex_threads', '2', *inputs,
        '-filter_complex', ';'.join(filters), '-map', '[out]', '-an',
        '-c:v', 'libx264', '-preset', 'medium', '-crf', '23',
        '-threads', '4', '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart', '-map_metadata', '-1', str(output),
    ], check=True)
    subprocess.run([
        args.ffmpeg, '-hide_banner', '-loglevel', 'error', '-y',
        '-i', str(output), '-frames:v', '1', '-q:v', '2',
        str(assets / f'noobius-reel-poster{suffix}.jpg'),
    ], check=True)
    print(f'Created {output.name}: {output.stat().st_size / 1024 / 1024:.2f} MiB', flush=True)
