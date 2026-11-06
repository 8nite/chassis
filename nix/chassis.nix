{
  lib,
  stdenvNoCC,
  callPackage,
  bun,
  nodejs,
  sysctl,
  makeBinaryWrapper,
  models-dev,
  ripgrep,
  wayland,
  installShellFiles,
  versionCheckHook,
  writableTmpDirAsHomeHook,
  node_modules ? callPackage ./node_modules.nix { },
}:
stdenvNoCC.mkDerivation (finalAttrs: {
  pname = "chassis";
  inherit (node_modules) version src;
  inherit node_modules;

  nativeBuildInputs = [
    bun
    nodejs
    installShellFiles
    makeBinaryWrapper
    models-dev
    writableTmpDirAsHomeHook
  ];

  postPatch = ''

    substituteInPlace packages/script/src/index.ts \
      --replace-fail 'throw new Error(`This script requires bun@''${expectedBunVersionRange}' \
                     'console.warn(`Warning: This script requires bun@''${expectedBunVersionRange}'
  '';

  configurePhase = ''
    runHook preConfigure

    cp -R ${finalAttrs.node_modules}/. .
    patchShebangs node_modules
    patchShebangs packages/*/node_modules

    runHook postConfigure
  '';

  env.MODELS_DEV_API_JSON = "${models-dev}/dist/_api.json";
  env.CHASSIS_DISABLE_MODELS_FETCH = true;
  env.CHASSIS_VERSION = finalAttrs.version;
  env.CHASSIS_CHANNEL = "prod";
  env.NODE_OPTIONS = "--max-old-space-size=4096";

  buildPhase = ''
    runHook preBuild

    cd ./packages/cli
    bun --bun ./script/build.ts --single --skip-install

    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall

    install -Dm755 dist/cli-*/bin/chassis $out/bin/chassis


    wrapProgram $out/bin/chassis \
      --prefix PATH : ${
        lib.makeBinPath (
          [
            ripgrep
          ]

          ++ lib.optional stdenvNoCC.hostPlatform.isDarwin sysctl
        )
      } ${lib.optionalString stdenvNoCC.hostPlatform.isLinux ''
        --prefix LD_LIBRARY_PATH : ${lib.makeLibraryPath [ wayland ]}
      ''}

    ln -s chassis $out/bin/chassis2

    runHook postInstall
  '';

  postInstall = lib.optionalString (stdenvNoCC.buildPlatform.canExecute stdenvNoCC.hostPlatform) ''



    $out/bin/chassis --completions bash > chassis.bash
    $out/bin/chassis --completions zsh > _chassis
    $out/bin/chassis --completions fish > chassis.fish

    installShellCompletion --cmd chassis \
      --bash chassis.bash \
      --fish chassis.fish \
      --zsh _chassis





    substitute chassis.bash chassis2.bash --replace-fail chassis chassis2
    substitute _chassis _chassis2 --replace-fail chassis chassis2
    substitute chassis.fish chassis2.fish --replace-fail chassis chassis2

    installShellCompletion --cmd chassis2 \
      --bash chassis2.bash \
      --fish chassis2.fish \
      --zsh _chassis2
  '';

  nativeInstallCheckInputs = [
    versionCheckHook
    writableTmpDirAsHomeHook
  ];
  doInstallCheck = true;
  versionCheckKeepEnvironment = [ "HOME" "CHASSIS_DISABLE_MODELS_FETCH" ];
  versionCheckProgramArg = "--version";

  passthru = {
    env = finalAttrs.env;
  };

  meta = {
    description = "The open source coding agent";
    homepage = "https://";
    license = lib.licenses.mit;
    mainProgram = "chassis";
    inherit (node_modules.meta) platforms;
  };
})
