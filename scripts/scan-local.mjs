#!/usr/bin/env node
// Runs n8n's community package scan (@n8n/scan-community-package) against this repo
// without publishing. The official scan only works on a package already on npm: it
// checks provenance, then lints the attested source and the published tarball. This
// runs the same lint rules on the same two inputs locally:
//
//   1. the source: package.json and nodes/credentials .ts/.js/.json files
//   2. the packed tarball: compiled .js and the package.json that would be published
//
// Provenance can only be checked after publishing. To scan a published version, run
// `npx @n8n/scan-community-package @paddle/n8n-nodes-paddle@<version>`.
//
//   pnpm build && node scripts/scan-local.mjs

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
	analyzePackage,
	SOURCE_FILE_PATTERNS,
} from '@n8n/scan-community-package/scanner/scanner.mjs';

const root = process.cwd();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'n8n-scan-'));

try {
	execFileSync('pnpm', ['pack', '--pack-destination', tmp], { cwd: root, stdio: 'ignore' });
	const tarball = fs.readdirSync(tmp).find((file) => file.endsWith('.tgz'));
	if (!tarball) throw new Error('pnpm pack did not produce a tarball');
	const packageDir = path.join(tmp, 'package');
	fs.mkdirSync(packageDir);
	execFileSync('tar', ['-xzf', path.join(tmp, tarball), '-C', packageDir, '--strip-components=1']);

	const results = [
		['source', await analyzePackage(root, SOURCE_FILE_PATTERNS)],
		['packed tarball', await analyzePackage(packageDir, ['**/*.js', 'package.json'])],
	];

	for (const [label, result] of results) {
		console.log(
			`${result.passed ? '✅' : '❌'} ${label}${result.passed ? '' : `: ${result.message}`}`,
		);
		if (result.details) console.log(result.details);
	}

	if (results.some(([, result]) => !result.passed)) {
		process.exitCode = 1;
	} else {
		console.log(
			'Passed the n8n community package scan rules. Provenance is checked after publishing.',
		);
	}
} finally {
	fs.rmSync(tmp, { recursive: true, force: true });
}
