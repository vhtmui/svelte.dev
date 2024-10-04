import type { Adapter, FileStub, Stub, Warning } from '$lib/tutorial';
import Bundler from '@sveltejs/repl/bundler';
// @ts-ignore package exports don't have types
import * as yootils from 'yootils';

/** Rollup bundler singleton */
let bundler: Bundler;

export const state = new (class RollupState {
	progress = $state.raw({ value: 0, text: 'initialising' });
	bundle = $state.raw<any>(null);
	warnings = $state.raw<Record<string, Warning[]>>({});
})();

/**
 * @returns {Promise<import('$lib/tutorial').Adapter>}
 */
export async function create(): Promise<Adapter> {
	bundler?.destroy();

	state.progress = { value: 0, text: 'loading files' };

	let done = false;

	bundler = new Bundler({
		packages_url: 'https://unpkg.com',
		svelte_url: `https://unpkg.com/svelte@next`, // TODO remove @next once 5.0 is released
		// svelte_url: `${browser ? location.origin : ''}/svelte`, // TODO think about bringing back main-build for Playground?
		onstatus(val) {
			if (!done && val === null) {
				done = true;
				state.progress = { value: 1, text: 'ready' };
			}
		}
	});

	state.progress = { value: 0.5, text: 'loading svelte compiler' };

	/** Paths and contents of the currently loaded file stubs */
	let current_stubs = stubs_to_map([]);

	async function compile() {
		const result = await bundler.bundle(
			[...current_stubs.values()]
				// TODO we can probably remove all the SvelteKit specific stuff from the tutorial content once this settles down
				.filter((f): f is FileStub => f.name.startsWith('/src/lib/') && f.type === 'file')
				.map((f) => ({
					name: f.name.slice(9).split('.').slice(0, -1).join('.'),
					source: f.contents,
					type: f.name.split('.').pop() ?? 'svelte'
				}))
		);
		state.bundle = result;

		const _warnings: Record<string, any> = {};
		for (const warning of result?.warnings ?? []) {
			const file = '/src/lib/' + warning.filename;
			_warnings[file] = _warnings[file] || [];
			_warnings[file].push(warning);
		}
		state.warnings = _warnings;
	}

	const q = yootils.queue(1);

	return {
		reset: (stubs) => {
			return q.add(async () => {
				current_stubs = stubs_to_map(stubs, current_stubs);

				await compile();

				return false;
			});
		},
		update: (file) => {
			return q.add(async () => {
				current_stubs.set(file.name, file);

				await compile();

				return false;
			});
		}
	};
}

function stubs_to_map(files: Stub[], map = new Map<string, Stub>()) {
	for (const file of files) {
		map.set(file.name, file);
	}
	return map;
}
