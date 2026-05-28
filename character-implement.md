Refactor the `CharacterBuilder.js` class and UI registry to build our 4 new cheerful, low-poly animal characters with fully articulated limbs, distinct stylized outfits, and flexible color assignment.  Build the meshes according to these detailed anatomical and clothing specifications:

1. BUMPO (The Bear):
   - Anatomy: Large, robust, rounded torso mesh, wide stocky limbs, and two small hemispherical ears placed on top of a large, friendly head.
   - Outfit & Styling: Wears a bright yellow, short-sleeved casual t-shirt that tightly fits his bulky frame, combined with simple dark blue denim-style shorts. Default fur material is a warm matte brown.

2. ZIPPY (The Squirrel):
   - Anatomy: Slender, compact torso, nimble thin limbs, and a giant, iconic bushy tail constructed from cascading low-poly segments curved upward behind his back.
   - Outfit & Styling: Wears a sporty, backwards-facing red baseball cap with holes cut out for his ears, and an open, unzipped white athletic vest. Default fur material is an energetic reddish-orange.

3. PUDDLE (The Beaver):
   - Anatomy: Medium, pear-shaped build, short sturdy legs, two prominent front-tooth geometry plates on the jaw, and a wide, flat, cross-hatched paddle tail extending from the pelvis.
   - Outfit & Styling: Wears a pair of classic denim overalls with a single metallic button strap fastened, exposing a cozy plaid texture underneath. Default fur material is a soft chestnut brown.

4. SLY (The Raccoon):
   - Anatomy: Sleek, agile frame, triangular pointed ears, a distinctive low-poly bandit mask geometry wrapped around his eye sockets, and a long striped ring-tail.
   - Outfit & Styling: Wears a dark green hooded sweatshirt (hood resting down on his shoulders) and a pair of rolled-up beige cargo pants. Default fur material is a sleek slate gray with black mask accents.

5. CLOTHING & COLOR SYSTEM INTEGRATION:
   - Ensure clothing meshes (`THREE.MeshStandardMaterial`) are separate from the core body meshes so they display distinct textile colors.
   - Map the player's dynamically chosen selection color directly onto a primary clothing asset (e.g., changing Bumpo's t-shirt, Zippy's cap, Puddle's overalls, or Sly's hoodie to the user's color) while keeping the default fur materials looking natural.
   - Update `LauncherState.js` and `UIManager.js` to showcase these detailed character configurations seamlessly.