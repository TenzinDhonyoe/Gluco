const { withXcodeProject, withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Expo config plugin that wires up a StoreKit Configuration file for local
 * RevenueCat / StoreKit 2 testing on the iOS simulator.
 *
 * 1. Copies Gluco.storekit into the ios/<project> directory
 * 2. Adds it as a resource in the Xcode project
 * 3. Patches the Xcode scheme so the simulator uses it automatically
 */

const STOREKIT_FILENAME = 'Gluco.storekit';

/**
 * Copy Gluco.storekit into ios/<projectName>/ and patch the Xcode scheme.
 */
const withStorekitCopy = (config) => {
  return withDangerousMod(config, [
    'ios',
    (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const projectName = config.modRequest.projectName;
      const iosDir = path.join(projectRoot, 'ios');

      // --- 1. Copy the .storekit file into the ios project directory ---
      const src = path.join(projectRoot, STOREKIT_FILENAME);
      const dest = path.join(iosDir, projectName, STOREKIT_FILENAME);

      if (fs.existsSync(src)) {
        fs.copyFileSync(src, dest);
      }

      // --- 2. Patch the Xcode scheme to reference the StoreKit config ---
      const schemePath = path.join(
        iosDir,
        `${projectName}.xcodeproj`,
        'xcshareddata',
        'xcschemes',
        `${projectName}.xcscheme`
      );

      if (fs.existsSync(schemePath)) {
        let scheme = fs.readFileSync(schemePath, 'utf8');

        // Clean up any leftover attribute from previous bad patch
        scheme = scheme.replace(
          /\s+storeKitConfigurationFileReference\s*=\s*"[^"]*"/g,
          ''
        );

        // Insert <StoreKitConfigurationFileReference> child element (idempotent)
        if (!scheme.includes('StoreKitConfigurationFileReference')) {
          // Path is relative to the .xcscheme file:
          // xcschemes/ -> xcshareddata/ -> Gluco.xcodeproj/ -> ios/ -> Gluco/
          const relPath = `../../../${projectName}/${STOREKIT_FILENAME}`;
          const element =
            `\n         <StoreKitConfigurationFileReference` +
            `\n            identifier = "${relPath}">` +
            `\n         </StoreKitConfigurationFileReference>`;

          scheme = scheme.replace(
            /(<LaunchAction\b[^>]*>)/,
            `$1${element}`
          );
        }

        fs.writeFileSync(schemePath, scheme, 'utf8');
      }

      return config;
    },
  ]);
};

/**
 * Add the .storekit file as a resource in the Xcode project so Xcode
 * recognises it in the navigator.
 */
const withStorekitXcodeProject = (config) => {
  return withXcodeProject(config, (config) => {
    const projectName = config.modRequest.projectName;
    const xcodeProject = config.modResults;

    // Avoid duplicate entries on repeated prebuilds
    const existingFile = xcodeProject.pbxItemByComment(
      STOREKIT_FILENAME,
      'PBXFileReference'
    );
    if (!existingFile) {
      // Manually add the file reference + build file since addResourceFile
      // crashes when there's no "Resources" PBX group (common in Expo projects).
      const fileRefUuid = xcodeProject.generateUuid();
      const buildFileUuid = xcodeProject.generateUuid();

      // PBXFileReference — path must be relative to ios/ (e.g. "Gluco/Gluco.storekit")
      // to match how Expo references other files in the project group.
      const relativePath = `${projectName}/${STOREKIT_FILENAME}`;
      xcodeProject.addToPbxFileReferenceSection({
        uuid: fileRefUuid,
        fileRef: fileRefUuid,
        basename: STOREKIT_FILENAME,
        path: relativePath,
        sourceTree: '"<group>"',
        lastKnownFileType: 'text.json',
        group: projectName,
      });

      // PBXBuildFile
      xcodeProject.addToPbxBuildFileSection({
        uuid: buildFileUuid,
        fileRef: fileRefUuid,
        basename: STOREKIT_FILENAME,
      });

      // Add to Resources build phase
      xcodeProject.addToPbxResourcesBuildPhase({
        uuid: buildFileUuid,
        fileRef: fileRefUuid,
        basename: STOREKIT_FILENAME,
      });

      // Add to the project's main group so it appears in Xcode navigator
      const mainGroup = xcodeProject.pbxGroupByName(projectName);
      if (mainGroup) {
        xcodeProject.addToPbxGroup(
          { uuid: fileRefUuid, fileRef: fileRefUuid, basename: STOREKIT_FILENAME },
          mainGroup.id || Object.keys(xcodeProject.hash.project.objects.PBXGroup)
            .find((key) => {
              const g = xcodeProject.hash.project.objects.PBXGroup[key];
              return typeof g === 'object' && g.name === projectName;
            })
        );
      }
    }

    return config;
  });
};

/**
 * Main plugin — composes both mods.
 */
const withStoreKitConfig = (config) => {
  config = withStorekitCopy(config);
  config = withStorekitXcodeProject(config);
  return config;
};

module.exports = withStoreKitConfig;
