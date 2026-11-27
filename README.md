# Hadal

A submersible physics engine: weight, buoyancy, drag and a ballast tank, taking one sub from the surface to the
bottom of the Mariana Trench, 10,935 m down, in the browser. No AI, no photographs, nothing learned.

**The core is the sub engine** (`src/sub.js`, `src/seawater.js`, `src/ocean.js`). Everything else on the page,
the light and the seafloor, is there to show the dive it computes.

**Scale.** Depth 0 to 10,935 m, pressure 1 to 1,130 bar, water from 28 C at the surface to 1.5 C in the deep.
One 11.7 tonne sub that moves in three directions, against a made-up trench wall 11.5 km across. A dive to the
bottom is 3.8 hours of simulated time.

**The bar.** `npm test` holds the engine to the reference tables in `test/reference/`, each with a stated
tolerance:

| table | what the engine must match | tolerance |
|---|---|---|
| `eos80-density.json` | seawater density at the 9 check values published with the UNESCO equation of state | 0.0001 kg/m^3 |
| `depth-pressure.json` | depth from pressure at each formula's published check value; the two formulas against each other | 0.001 m; 0.1 % |
| `sinking-speed.json` | sinking speed from rest at 35 points, against the closed-form answer for quadratic drag | 0.2 % of top speed |
| `dive-baseline.json` | time to reach 7 depth marks and speed at each, recorded from this engine | 1 % |

The last one is a regression baseline: it fails if a change moves the dive. Re-record it on purpose with
`node tools/dive_baseline.mjs --record`.

## Run it

```bash
python3 -m http.server 8793
```

Open <http://localhost:8793/web/>. Press **Dive** to pump water into the trim tank and sink; **Hold** and
**Rise** trim it back. **Stay by the wall** keeps the sub a few metres off the trench wall as it goes down;
W A S D steer it yourself. Drag to look round, **Pilot's view** looks out of the front, **Lamps** switches the
floodlights. A real dive to the bottom takes almost four hours, so use **×10** and **×100**, or **Skip down
to** a zone. The read-outs show depth, pressure, water temperature, how much sunlight is left, and the zone
you are in.

It needs no graphics card. Without one, the browser draws in software, so the page draws fewer pixels when
frames come slowly.

Tests and the accuracy check need Node 22, and nothing else:

```bash
npm test
node tools/eval.mjs
```

## How it works

1. **Light** (`src/water.js`). Absorption of pure water from Pope and Fry (1997) and scattering of pure
   seawater from Smith and Baker (1981), every 25 nm from 400 to 700 nm, plus one "particles" knob for what
   else is in the water. Sunlight going down is dimmed by the diffuse attenuation Kd = (a + bb) / 0.8 at each
   wavelength, then turned into colour with the CIE 1931 colour matching functions, so red goes in the first
   15 m and blue lasts longest. The page draws from a table of that colour by depth. Sideways, light is dimmed
   by the beam attenuation c = a + b, channel by channel, which is why the lamps' warm light turns blue-green a
   few metres out.
2. **The water itself** (`web/underwater.js`). Every surface is shaded by the sunlight left at its own depth,
   and by the sub's two floodlights, then seen through the water: dimmed along the path
   to the eye and brightened by light the water scatters toward it, including the visible beams of the lamps,
   marched in steps. Near the surface you see the sky through Snell's window and sunlight caustics on the reef.
   Flecks of marine snow sink through the beams. The eye adapts as the light fades, up to a limit.
3. **Seawater density** (`src/seawater.js`). The UNESCO 1980 equation of state (EOS-80): density from
   salinity, temperature and pressure. The sub's drag uses the density at its own depth, about 1,022 kg/m^3
   at the warm surface and 4.5 % more at the bottom.
4. **Pressure and temperature** (`src/ocean.js`). Pressure from depth by Saunders (1981), the formula in the
   UNESCO seawater routines, checked against an independent integration of dp/dz = rho g with seawater
   compressed according to EOS-80. Temperature follows a smoothed tropical Pacific profile.
5. **The sub** (`src/sub.js`). Weight, buoyancy and quadratic drag, with an added mass for the water it pushes.
   Seawater gets about 4 % denser by the bottom, so like real deep submersibles it trims with a variable
   ballast tank, a few kilograms a second. It sinks at about 0.8 m/s, so a dive to the bottom takes 3.8 hours,
   much as real dives do.
6. **The seafloor** (`src/seafloor.js`). A made-up slice of ocean: a reef, a drop-off, a trench wall with
   gullies, blocks and terraces, and a flat floor at 10,935 m. It is built round the sub as it moves.

## How faithful it is

`tools/eval.mjs` checks the physics against answers known in advance:

| check | result |
|---|---|
| Seawater density against the 9 EOS-80 check values, worst | 0.000005 kg/m^3 |
| The UNESCO depth formula against its check value (9,712.653 m at 10,000 dbar, 30 degrees) | matches to 0.001 m |
| Saunders' formula against its published check value (7,321.444 m at 7,500 dbar, 30 degrees) | off by 0.00025 m |
| Saunders vs an independent hydrostatic integration, at 1,000 m / 5,000 m / 10,935 m | 0.02 % / 0.002 % / 0.09 % apart |
| Red / green / blue light falls to 1 % | 15 m / 66 m / 230 m |
| Light plants can use falls to 1 %; sunlight falls to a ten-billionth | 164 m; 992 m (see below) |
| The sub's step-by-step sinking vs the exact tanh solution for quadratic drag | within 0.1 % of top speed |
| Surface to the bottom of the Challenger Deep | 3.8 hours at 0.81 m/s |

Two numbers are settings, not results. The particles knob is set so that the sunlight zone ends near 165 m and
the last trace of sunlight fades near 1,000 m, the usual boundaries in clear open ocean (pure seawater alone
would carry light to 246 m). And the trench wall averages 46 degrees, where real trench walls average 5 to 10:
it is squeezed so the whole dive happens beside it.

The pressure at the bottom comes out at 1,130 bar. Saunders' formula assumes a standard ocean at 0 C all the
way down, which is denser than the real warm tropical water above the trench, so this is a few percent high.

## Not done yet

The engine first:

- **Real buoyancy.** The hull and foam are taken to compress exactly as seawater does, so the trim tank alone
  sets how heavy the sub is. A real hull is stiffer than water, so it gains lift as it goes down and has to
  pump ballast to keep sinking. Buoyancy should come from the hull's displaced volume and the water's density.
- **Rotation.** The sub moves in three directions but cannot pitch, roll or yaw. Weight and buoyancy act at
  different points on a real sub, which is what keeps it upright.
- **Ballast as tanks and weights.** One trim number stands in for tanks, pumps with a rate that falls with
  pressure, and drop weights for the trip back up.
- **Hitting things.** The sub passes through the seafloor.
- **Currents**, and drag that depends on speed through the water rather than over the ground.
- **Density past 10,000 dbar.** The last 1,200 m of the dive is beyond the range EOS-80 was fitted over.
- **Salinity** is 35 everywhere.

Then the rest:

- **Pressure from the real water column**: integrate with EOS-80 density from the temperature profile instead
  of the standard ocean, and check it against published pressures at the Challenger Deep.
- **Real water types**: chlorophyll and coastal water, not just the one knob.
- **Speed without a graphics card**: a frame budget the page is held to, measured with software drawing.
- **Sound**: the sub's thrusters, pings and creaks as the pressure builds.
- **Sun shafts** near the surface, from the light field's angular shape.

## Layout

- `src/` the engine (`sub.js`, `seawater.js`, `ocean.js`) and the world round it (`water.js`, `seafloor.js`,
  `random.js`), plain ES modules shared by the page and Node
- `web/` the page: `index.html`, `app.js`, `underwater.js` (lighting), `sub-model.js` (the sub's shape), `style.css`,
  vendored three.js
- `tools/` the accuracy check, the dive baseline
- `test/` `node --test`; `test/reference/` the tables the engine is held to

Licence: MIT ([LICENSE](LICENSE)). Credits: [CREDITS.md](CREDITS.md).
