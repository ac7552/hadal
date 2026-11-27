# Credits

| What | From | Licence | Where |
|---|---|---|---|
| Absorption of pure water, 400 to 700 nm | R. M. Pope and E. S. Fry, "Absorption spectrum (380-700 nm) of pure water. II. Integrating cavity measurements", Applied Optics 36 (1997) 8710 | published measurements | `src/water.js` |
| Scattering of pure seawater | R. C. Smith and K. S. Baker, "Optical properties of the clearest natural waters (200-800 nm)", Applied Optics 20 (1981) 177 | published measurements | `src/water.js` |
| CIE colour matching functions | the analytic fit of Wyman, Sloan and Shirley, JCGT 2 (2013) | formula | `src/water.js` |
| Pressure from depth | P. M. Saunders, "Practical conversion of pressure to depth", J. Phys. Oceanogr. 11 (1981) 573 | formula | `src/ocean.js` |
| Seawater density, and depth from pressure | UNESCO EOS-80 equation of state and the depth formula, from N. P. Fofonoff and R. C. Millard, "Algorithms for computation of fundamental properties of seawater", UNESCO Technical Papers in Marine Science 44 (1983), with their published check values | formulas and published check values | `src/seawater.js`, `src/ocean.js`, `test/reference/` |
| Depth of the Challenger Deep | 10,935 m (crewed dives of 2020) | fact | `src/ocean.js` |
| 3D drawing | three.js r170 | MIT | `web/vendor/` (`three-LICENSE.txt`) |

The seafloor and the sub are drawn by this project's own code. No photographs or 3D models are used.

Every file in this repository is under the MIT licence: this project's code and the vendored three.js. The
formulas, measurements and check values above are published numbers used as constants.
