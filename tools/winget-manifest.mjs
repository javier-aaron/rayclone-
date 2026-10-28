'use strict';

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

function computeSha256(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const buffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buffer).digest('hex').toUpperCase();
}

function generateWingetManifests(distDir = 'dist') {
  const pkgJsonPath = path.resolve('package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
  const version = pkg.version || '2.3.0';

  const setupExePath = path.join(distDir, `Rayclone-Setup-${version}.exe`);
  const setupSha256 = computeSha256(setupExePath) || 'PENDING_BUILD_HASH';

  const outputDir = path.join(distDir, 'winget', version);
  fs.mkdirSync(outputDir, { recursive: true });

  // 1. Version Manifest
  const versionYaml = `PackageIdentifier: Rayclone.Rayclone
PackageVersion: ${version}
DefaultLocale: en-US
ManifestType: version
ManifestVersion: 1.6.0
`;
  fs.writeFileSync(path.join(outputDir, 'Rayclone.Rayclone.yaml'), versionYaml, 'utf8');

  // 2. Installer Manifest
  const installerYaml = `PackageIdentifier: Rayclone.Rayclone
PackageVersion: ${version}
Platform:
- Windows.Desktop
InstallModes:
- interactive
- silent
Installers:
- Architecture: x64
  InstallerType: nullsoft
  InstallerUrl: https://github.com/rayclone/rayclone/releases/download/v${version}/Rayclone-Setup-${version}.exe
  InstallerSha256: ${setupSha256}
  UpgradeCode: '{68a3f820-e221-4d37-83ba-8d0202167c2a}'
ManifestType: installer
ManifestVersion: 1.6.0
`;
  fs.writeFileSync(path.join(outputDir, 'Rayclone.Rayclone.installer.yaml'), installerYaml, 'utf8');

  // 3. Locale Manifest
  const localeYaml = `PackageIdentifier: Rayclone.Rayclone
PackageVersion: ${version}
PackageLocale: en-US
Publisher: Rayclone Open Source
PublisherUrl: https://github.com/rayclone/rayclone
PublisherSupportUrl: https://github.com/rayclone/rayclone/issues
PackageName: Rayclone
PackageUrl: https://github.com/rayclone/rayclone
License: MIT
ShortDescription: High-performance, native-grade Windows power launcher and productivity workspace.
Description: Rayclone brings Raycast-grade keyboard-first workflows, native Windows DWM acrylic styling, developer tools, system controls, and AI to Windows 10 and 11.
Tags:
- launcher
- raycast
- productivity
- spot-light
- quicklinks
- window-snapping
- developer-tools
ManifestType: defaultLocale
ManifestVersion: 1.6.0
`;
  fs.writeFileSync(path.join(outputDir, 'Rayclone.Rayclone.locale.en-US.yaml'), localeYaml, 'utf8');

  console.log(`Generated winget manifests in: ${outputDir}`);
  return { outputDir, setupSha256, version };
}

generateWingetManifests();
