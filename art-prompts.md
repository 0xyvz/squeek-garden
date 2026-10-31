# Squeek Garden: image prompts

Two images for the top scene. The site uses them automatically when they exist:

```
web/public/art/hero-day.png     shown while Squeektoshi naps (and in daytime)
web/public/art/hero-night.png   shown while he runs (and at night)
```

Leave the hamster and the wheel out of both images: the game draws its own animated pixel hamster and wheel on the empty
patch of grass, driven by the real wheel. Ask for the widest landscape size the tool offers (3:1 is ideal, 3:2 works;
the site crops to fit).

## Style block (append to both prompts)

> Pixel art, 16-bit SNES-era cozy farming game style, crisp hard-edged pixels, no anti-aliasing, no blur, no gradients
> smoother than the pixel grid. Limited palette: leaf greens #2e6b34 #4f9d43 #86c95f, soil browns #5a3a22 #7a4f2e
> #9a6a3e, sunflower yellow #f2b01e, pumpkin orange #e3761a, cream #f6e7c1, soft sky blue #8fd0f5, dark brown outlines
> #2b1d16. Clean readable shapes, gentle shading. No text, no letters, no logo, no UI, no watermark, no people, no
> animals.

## 1. hero-day.png

> A wide panoramic scene of a small cozy vegetable garden at the edge of a meadow on a sunny late afternoon. On the right
> half, a tiny wooden hamster cottage with a round door and a little porch, and in front of it an empty, clear patch of
> short grass (keep this patch completely free of objects). Garden beds with sunflowers, timothy hay, pumpkins, broccoli,
> white chamomile flowers, carrots and blueberry bushes. Behind: soft rolling green hills, a few fluffy clouds, a winding
> dirt path. The left third of the image is calm open sky and meadow with very little detail, so text can sit on top.
> Landscape 3:1 composition, horizon at about two-thirds of the height.
> *(+ style block)*

## 2. hero-night.png

Best made from the day image so both match: upload `hero-day.png` and ask:

> Make this exact same image, same composition and same pixel art style, at night: deep blue starry sky, a big pale
> moon, a warm glowing lantern by the cottage door, a few fireflies over the garden, garden beds softly lit, and a pale
> glowing round melon among the plants. Keep the patch of grass in front of the cottage empty.
> *(+ style block)*

If the tool cannot edit an image, use prompt 1 with "on a calm night" instead of "on a sunny late afternoon" and the
night details above.

## 3. NFT: gardener hamster (collection base)

Square 1:1, the biggest size the tool offers. Make the base first, then make every variant from it (upload the base and
ask for one change at a time) so the whole set keeps the same pose, size and outline.

> A pixel art portrait of a chubby little hamster gardener, front-facing three-quarter view, from the chest up, centred
> and filling about 70% of the frame. Round body, big shiny dark eyes with a white highlight, small pink nose, rosy
> cheeks, tiny paws holding a small metal watering can. Golden-orange and cream fur. Wearing denim overalls with one
> brass button and a straw sun hat with a small sunflower tucked into the band. Friendly, cosy, slightly proud
> expression. Flat solid meadow-green background (#86c95f) with no scenery, a soft darker ground shadow under the body.
> Square 1:1 composition, 64x64 pixel grid scaled up, every pixel a crisp square.
> *(+ style block, but replace "no animals" with "a single hamster only")*

## 4. NFT: variants (one change per request, uploading the base)

> Keep this exact hamster, pose, framing, size and pixel style. Change only: **[one trait]**.

| Trait | Options |
|---|---|
| Fur | golden-orange and cream · soft grey and white · white with brown patches · chocolate brown · black and white panda |
| Hat | straw sun hat with sunflower · knitted green beanie · crown of sunflower petals · striped night cap with a pom-pom · no hat, a leaf on the head |
| Held item | watering can · big orange carrot · sunflower seed · tiny shovel · pumpkin slice · broccoli floret |
| Outfit | denim overalls · red scarf · green gardener apron · yellow raincoat · nothing |
| Background | meadow green #86c95f · sky blue #8fd0f5 · cream #f6e7c1 · sunset peach #f6b38a · night navy #1d2a4a with a tiny moon and two stars |

Rare look, used sparingly:

> Keep this exact hamster, pose and pixel style. Make it a **Moon** edition: night-navy background with a pale glowing
> moon behind the head, fur softly lit in silver-blue, a small glowing moon melon in its paws, three tiny fireflies.
