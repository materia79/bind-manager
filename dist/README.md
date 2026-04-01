# dist

This directory contains the browser-ready build artifacts for Bind Manager.

If you want to use Bind Manager without a bundler, this is the folder you host and load from your app.

## Contents

- `bind-manager.js`
	- Non-minified build for development and debugging.
	- Exposes a global: `window.BindManager`.
- `bind-manager.min.js`
	- Minified production build.
	- Also exposes `window.BindManager`.
- `bind-manager.js.map`
	- Source map used by browser devtools so stack traces and breakpoints can map back to source.
	- Keep it alongside `bind-manager.js` during development.
- `standalone-demo.html`
	- Local demo page that loads the dist build directly.

## Which file should I use?

- Use `bind-manager.min.js` for production websites.
- Use `bind-manager.js` when debugging behavior or stepping through code.
- Keep `bind-manager.js.map` available in development for better debugging output.

## Browser Usage (Script Tag)

```html
<script src="/path/to/dist/bind-manager.min.js"></script>
<script>
	const binds = window.BindManager.createBindManager({
		namespace: 'my-game',
		builtInTools: {
			inputRemap: true,
			controllerTest: true,
		},
	});

	const jump = binds.registerAction({
		id: 'jump',
		label: 'Jump',
		group: 'Movement',
		slots: 2,
		defaultBindings: ['Space', null],
	});

	jump.onPressed(() => {
		console.log('Jump pressed');
	});
	jump.showHint();
</script>
```

## Standalone Demo

This folder includes [standalone-demo.html](dist/standalone-demo.html), a no-build demo page that loads the dist bundle directly in the browser.

Use it to quickly verify that the generated files work end-to-end without app-specific integration code.

Recommended ways to run it:

- From the repository root, run `npm run demo` and open `http://localhost:3000/dist/standalone-demo.html`
- Or host the `dist` folder on any static server and open `/dist/standalone-demo.html`

The demo expects these files to be available in the same folder:

- `bind-manager.js`
- `bind-manager.min.js` (if the page is configured to load minified output)
- `bind-manager.js.map` (optional, for debugging)

## CDN / Static Hosting Notes

- You can host these files on any static host (for example GitHub Pages, Netlify, S3, Cloudflare R2, or your own CDN).
- For cache-friendly deployments:
	- Use `bind-manager.min.js` for runtime.
	- Version your path or filename in release pipelines to avoid stale client caches.

## Rebuilding dist

From the project root:

```bash
npm run build
```

This regenerates the files in this directory.

For iterative development:

```bash
npm run build:watch
```

## Compatibility and Runtime

- Target: modern browsers.
- Input support in this project: keyboard + browser Gamepad API.
- Public global API entrypoint in dist builds: `window.BindManager`.

## Troubleshooting

- `window.BindManager` is undefined:
	- Ensure the script path is correct and loads before your initialization script.
	- Check browser devtools network tab for 404 responses.
- Source maps are not used in devtools:
	- Confirm `bind-manager.js.map` is hosted next to `bind-manager.js`.
	- Make sure devtools source maps are enabled.
- Nothing responds to input:
	- Confirm your actions are registered and bindings exist.
	- Verify the page has focus for keyboard input.