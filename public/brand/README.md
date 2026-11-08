# Logo

Put the Care-A-Van logo here as **`logo.png`** (PNG, ideally 1000 px or wider, white or
transparent background). The app header and sign-in screen use it automatically.

Then make the app icons (home screen, browser tab) from it:

```bash
python3 scripts/make-icons.py
```

and commit `public/brand/logo.png`, `public/icons/*` and `public/favicon.png`.
