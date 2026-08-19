# Castle Climber

A small 3D run-and-jump platformer that runs in any browser. Climb the spiral
staircase around a candy-colored castle tower, hop the floating blocks, and
claim the golden crown on the roof.

**Play it:** https://tubagusdss.github.io/castle-climber/

## Controls

| Action | Keyboard / mouse | Touch |
| --- | --- | --- |
| Run | `W` `A` `S` `D` or arrow keys | left-side joystick |
| Jump | `Space` (press again mid-air to flip) | JUMP button |
| Sprint | `Shift` | — |
| Look around | move the mouse (click to lock the pointer) | drag the right half |
| Zoom | scroll wheel | — |
| Restart | `R` | — |

Miss a jump and you reappear on the last block you stood on, so a fall costs
seconds rather than the whole climb.

## What's in the box

- `index.html` - the whole game as one self-contained file. Open it directly in
  a browser; there is nothing to install and no network requests except the
  Google Fonts stylesheet.
- `game.js` - game source: world building, physics, camera, HUD wiring.
- `shell.html` - page shell, HUD markup, and CSS.
- `build.js` - inlines Three.js and `game.js` into `index.html`.
- `vendor/three.module.min.js` - Three.js r160 (MIT), inlined at build time.

## Building

```sh
node build.js      # rewrites index.html from shell.html + game.js + vendor
```

The build rewrites the Three.js ES export list into a plain `THREE` object and
wraps the game in its own closure, so the two can share one inline module
script without their names colliding.

## Notes on the engine

Everything is axis-aligned (or Y-rotated) boxes, resolved by smallest-overlap
push-out with a step-up probe so stairs are walkable. Movement has coyote time,
a jump buffer, variable jump height, and a double jump; moving platforms carry
whatever is standing on them.

Adding `#dev` to the URL exposes a `window.CASTLE` handle with `sim()`,
`warp()`, `look()` and `pause()` for stepping the physics deterministically -
that is how the jump distances and platform spacing were tuned.

Three.js is bundled under the MIT license; its copyright header is preserved in
`index.html`.
