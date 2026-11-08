# Logo

`CareAVanLogo.jpg` is the master Care-A-Van logo (full size, white background).

Everything the app uses is made from it:

```bash
python3 scripts/make-icons.py
```

That writes `src/assets/logo.png` (header and sign-in screen), the home-screen icons in
`public/icons/`, and `public/favicon.png` (browser tab). To change the logo, replace
`CareAVanLogo.jpg` with the new file (same name), run the command, and commit the results.
