# NXS Streamers Protection

This project now includes a protected release build for the browser extension.

## What the protection does

- Obfuscates the extension JavaScript before release
- Disables hidden developer surfaces by default
- Keeps sensitive OTP and moderation logic on the backend

## Important limitation

Browser extensions cannot be made impossible to extract. Anything shipped to the client can eventually be inspected.

The real protection layers are:

- ship the obfuscated build, not the raw source folder
- keep secrets and privileged logic on the backend
- rotate leaked credentials quickly

## Build the protected release

From the `Extension_Client` folder:

```powershell
npm install
npm run build:protected
```

The protected output will be created here:

`dist/NXS_Streamers_Protected`

Load that output folder in your browser when you want the protected build instead of the raw development source.
