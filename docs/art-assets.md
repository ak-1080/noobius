# Art assets

- `public/assets/noobius.jpeg`: supplied by the user, original Noobius character reference. No retouching.
- `public/assets/noobius-intro.mp4`: supplied by the user. 5.167 seconds, 2560×1440, 24 fps, H.264 with AAC audio. Original source retained unchanged for the homepage edit.
- `public/assets/intro-poster.jpg`: retained first frame of the original source.
- `public/assets/noobius-night-shift-reel.mp4`: approximately 18-second silent edit of the four user-supplied videos, 1920×1080, H.264, 24 fps, fast-start MP4. Desk → cable mishap → running → server activation → desk. Half-second dissolves include the circular return, with no poster flash at the loop boundary.
- `public/assets/noobius-night-shift-reel-mobile.mp4`: 608×1080 version with a separate crop for each shot to keep Noobius visible on phones. Only the appropriate video source loads at the 640px breakpoint.
- `public/assets/noobius-reel-poster.jpg` and `noobius-reel-poster-mobile.jpg`: matching first-frame fallbacks for loading, reduced motion, or playback failure.
- `public/assets/facility.png`: generated using the built-in ImageGen tool. 1672×941. One request, no variants or retries; inspected before integration. Used when WebGL is unavailable.

Generation prompt: Create one original wide stylized 3D isometric AI data-center night-shift diorama in midnight navy. Brushed blue-gray floor tiles, a few chunky charcoal GPU racks with mint/teal and amber LEDs, thick cooling pipes, maintenance cart, tiny coffee cup and yellow maintenance markings. Tactile toy-scale indie-game quality with crisp controlled detail. Room in the right 60%, quiet dark negative space left. Soft teal and amber lighting. No people, characters, text, logos, typography, interface or watermark; no purple or cyberpunk city.

The playable room and avatar are native Three.js geometry, animated and controlled by game state. They do not use copied reference-site artwork.

The campus revision uses a continuous lathed bean silhouette, unequal oversized eyes, curved worried brows, a small open frown with two teeth, a loose shirt collar/sleeves, padded earcups, an arched headband, and a curved microphone boom. Walking animates arms and feet; the source portrait remains unchanged.

The edit is reproducible with `scripts/build-homepage-reel.py --ffmpeg /path/to/ffmpeg --source-dir /path/to/originals`. It uses the original desk clip from 0–3.5 seconds, cable clip from 0.75–7.5 seconds, running clip from 1–4.5 seconds, and button clip from 1.5–7.75 seconds. The running clip's awkward opening and slowdown are removed. Original Flow exports are untouched; only the edited derivatives are served. Audio tracks are removed entirely.

Background clips are listed in `components/noobius/TitleScene.tsx`. The reel loops natively. Failed clips are skipped with a poster fallback if none remain. Playback pauses in hidden tabs, and the title scene unmounts when entering the game. The corner control pauses/resumes motion; background audio is always muted.
