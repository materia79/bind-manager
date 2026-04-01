import { context, build } from 'esbuild';

const sharedConfig = {
	entryPoints: ['src/index.js'],
	bundle: true,
	platform: 'browser',
	target: ['es2020'],
	format: 'iife',
	globalName: 'BindManager',
	legalComments: 'none',
};

const outputConfigs = [
	{
		outfile: 'dist/bind-manager.js',
		sourcemap: true,
		minify: false,
	},
	{
		outfile: 'dist/bind-manager.min.js',
		sourcemap: false,
		minify: true,
	},
];

async function runBuild() {
	await Promise.all(outputConfigs.map((outputConfig) => build({
		...sharedConfig,
		...outputConfig,
	})));
	console.log('Build complete: dist/bind-manager.js and dist/bind-manager.min.js');
}

async function runWatch() {
	const contexts = await Promise.all(outputConfigs.map((outputConfig) => context({
		...sharedConfig,
		...outputConfig,
	})));

	await Promise.all(contexts.map((ctx) => ctx.watch()));
	console.log('Watching build targets: dist/bind-manager.js and dist/bind-manager.min.js');

	const stop = async () => {
		await Promise.all(contexts.map((ctx) => ctx.dispose()));
		process.exit(0);
	};

	process.on('SIGINT', stop);
	process.on('SIGTERM', stop);
}

const isWatchMode = process.argv.includes('--watch');

if (isWatchMode) {
	runWatch().catch((error) => {
		console.error(error);
		process.exit(1);
	});
} else {
	runBuild().catch((error) => {
		console.error(error);
		process.exit(1);
	});
}
