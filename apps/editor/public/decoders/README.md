# Bundled asset decoders

Copied without modification from the installed `three@0.185.1` package:

- `basis/`: `three/examples/jsm/libs/basis/`, Basis Universal by Binomial LLC.
- `draco/`: `three/examples/jsm/libs/draco/gltf/`, Draco by Google.
- The upstream decoder README files retain their project and license references.

Basis Universal and Draco use Apache License 2.0; its standard text is included
as `LICENSE-APACHE-2.0`. The three.js distribution license is retained as
`LICENSE-THREE`.

The standalone app sets these same-origin paths before loading scene assets.
The reusable viewer package retains its existing decoder defaults for embedders.
