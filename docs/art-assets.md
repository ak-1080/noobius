# Art assets

- `public/assets/noobius.jpeg`: supplied by the user, original Noobius character reference. No retouching.
- `public/assets/noobius-intro.mp4`: supplied by the user. 5.167 seconds, 2560×1440, 24 fps, H.264 with AAC audio. Used in the cinematic player without modification.
- `public/assets/intro-poster.jpg`: first frame extracted from that video, used for the fullscreen title scene with a subtle reduced-motion-aware camera drift.
- `public/assets/facility.png`: generated using the built-in ImageGen tool. 1672×941. One request, no variants or retries; inspected before integration. Used when WebGL is unavailable.

Generation prompt: Create one original wide stylized 3D isometric AI data-center night-shift diorama in midnight navy. Brushed blue-gray floor tiles, a few chunky charcoal GPU racks with mint/teal and amber LEDs, thick cooling pipes, maintenance cart, tiny coffee cup and yellow maintenance markings. Tactile toy-scale indie-game quality with crisp controlled detail. Room in the right 60%, quiet dark negative space left. Soft teal and amber lighting. No people, characters, text, logos, typography, interface or watermark; no purple or cyberpunk city.

The playable room and avatar are native Three.js geometry, animated and controlled by game state. They do not use copied reference-site artwork.
