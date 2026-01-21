const { withPodfile } = require('expo/config-plugins');

const withCxx20 = (config) => {
    return withPodfile(config, (config) => {
        const podfile = config.modResults.contents;

        // Code to inject into post_install
        const fixCode = `
    installer.pods_project.targets.each do |target|
      if target.name == 'RNReanimated'
        target.build_configurations.each do |config|
          config.build_settings['CLANG_CXX_LANGUAGE_STANDARD'] = 'c++20'
        end
      end
    end
    `;

        // Append to the existing post_install block provided by Expo
        // Expo Podfile usually ends with `use_react_native!(...)` or has a post_install block.
        // Safer injection:

        if (podfile.includes('post_install do |installer|')) {
            config.modResults.contents = podfile.replace(
                'post_install do |installer|',
                `post_install do |installer|
${fixCode}`
            );
        } else {
            // Fallback if no post_install block found (unlikely in Expo)
            config.modResults.contents += `
        post_install do |installer|
          ${fixCode}
        end
        `;
        }

        return config;
    });
};

module.exports = withCxx20;
