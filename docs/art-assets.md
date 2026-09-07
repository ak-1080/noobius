# Art assets

- `public/assets/noobius.jpeg`: supplied by the user, original Noobius character reference. No retouching.
- `public/assets/noobius-intro.mp4`: supplied by the user. 5.167 seconds, 2560×1440, 24 fps, H.264 with AAC audio. Used as a muted, inline autoplay background on the title screen. The source file is unchanged.
- `public/assets/intro-poster.jpg`: first frame extracted from that video, used while the background video loads, at the loop transition, and when motion is reduced or playback is unavailable.
- `public/assets/facility.png`: generated using the built-in ImageGen tool. 1672×941. One request, no variants or retries; inspected before integration. Used when WebGL is unavailable.

Generation prompt: Create one original wide stylized 3D isometric AI data-center night-shift diorama in midnight navy. Brushed blue-gray floor tiles, a few chunky charcoal GPU racks with mint/teal and amber LEDs, thick cooling pipes, maintenance cart, tiny coffee cup and yellow maintenance markings. Tactile toy-scale indie-game quality with crisp controlled detail. Room in the right 60%, quiet dark negative space left. Soft teal and amber lighting. No people, characters, text, logos, typography, interface or watermark; no purple or cyberpunk city.

The playable room and avatar are native Three.js geometry, animated and controlled by game state. They do not use copied reference-site artwork.

The campus revision uses a continuous lathed bean silhouette, unequal oversized eyes, curved worried brows, a small open frown with two teeth, a loose shirt collar/sleeves, padded earcups, an arched headband, and a curved microphone boom. Walking animates arms and feet; the source portrait remains unchanged.

Background clips are listed in `components/noobius/TitleScene.tsx`, with separate desktop/mobile crop positions. One clip loops natively; multiple clips advance on completion and cycle back to the beginning. Failed clips are skipped with a poster fallback if none remain. Playback pauses in hidden tabs, and the title scene unmounts when entering the game. The corner control pauses/resumes motion; background audio is always muted.
