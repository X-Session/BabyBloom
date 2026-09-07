# FutureBaby — exact first-reference UI

This version recreates the first supplied screenshot as an actual responsive UI:
status/header, hero composition, quick feature card, four-image baby gallery,
daily affirmation panel, and bottom navigation.

The dummy baby/hero artwork is cropped from the supplied reference image so the
visual result stays close to the original design. Replace those crops with owned
or licensed assets before production if necessary.

## Run the app

Install dependencies and copy the environment template:

```bash
npm install
cp .env.example .env
```

Add the Replicate token and the exact model slug to `.env`:

```env
REPLICATE_API_TOKEN=your_token_here
REPLICATE_MODEL=google/nano-banana
REPLICATE_IMAGE_INPUT_MODE=array
REPLICATE_FIRST_IMAGE_FIELD=image_input
REPLICATE_PROMPT=Create a warm, realistic baby portrait inspired by the two reference photos.
```

Nano Banana is selected because it supports multi-image fusion and prompting.
Replicate pricing can change, so check the model page before production use.
For another model, use `REPLICATE_IMAGE_INPUT_MODE=two-fields` and change the
image field names to match that model's API schema.

Start the app:

```bash
npm start
```

Open `http://localhost:3000`. The Generate page sends the two uploaded photos to
`POST /api/generate-baby`; the Replicate token remains server-side.
