{
  lib,
  stdenv,
  bun,
  nodejs,
  darwin,
  callPackage,
  makeWrapper,
  writableTmpDirAsHomeHook,
  autoPatchelfHook,
  copyDesktopItems,
  makeDesktopItem,
  chassis,
}:
let
  electronPin =
    (lib.pipe ../packages/desktop/package.json [
      builtins.readFile
      builtins.fromJSON
    ]).devDependencies.electron;
  electron = callPackage ./electron.nix { inherit electronPin; };
in
stdenv.mkDerivation (finalAttrs: {
  pname = "chassis-desktop";
  inherit (chassis)
    version
    src
    node_modules
    patches
    ;

  nativeBuildInputs = [
    bun
    nodejs
    makeWrapper
    writableTmpDirAsHomeHook
  ]
  ++ lib.optionals stdenv.hostPlatform.isLinux [
    autoPatchelfHook
    copyDesktopItems
  ]
  ++ lib.optionals stdenv.hostPlatform.isDarwin [
    darwin.cctools
    darwin.sigtool

    darwin.autoSignDarwinBinariesHook
  ];

  buildInputs = lib.optionals stdenv.hostPlatform.isLinux [
    (lib.getLib stdenv.cc.cc)
  ];

  desktopItems = lib.optional stdenv.hostPlatform.isLinux (makeDesktopItem {
    name = "ai.chassis.desktop";
    desktopName = "Chassis";
    exec = "chassis-desktop %U";
    icon = "ai.chassis.desktop";

    startupWMClass = "Chassis";
    categories = [ "Development" ];
  });

  env = chassis.env // {
    ELECTRON_SKIP_BINARY_DOWNLOAD = "1";
  };

  postPatch =

    ''
      substituteInPlace packages/script/src/index.ts \
        --replace-fail 'throw new Error(`This script requires bun@''${expectedBunVersionRange}' \
                       'console.warn(`Warning: This script requires bun@''${expectedBunVersionRange}'
    ''


    + lib.optionalString stdenv.hostPlatform.isLinux ''
      substituteInPlace \
        packages/desktop/src/main/windows/appearance.ts \
        packages/desktop/src/main/service/desktop-cli.ts \
        --replace-fail "process.resourcesPath" "'$out/opt/chassis-desktop/resources'"
    '';

  preBuild = ''
    echo "electron ${electron.version} from nixpkgs ${lib.version}, package.json pins ${electronPin}"
    cp -r "${electron.dist}" $HOME/.electron-dist
    chmod -R u+w $HOME/.electron-dist

    cp -R ${finalAttrs.node_modules}/. .
    patchShebangs node_modules
    patchShebangs packages/*/node_modules
  '';

  buildPhase = ''
    runHook preBuild

    cd packages/desktop

    export CHASSIS_CLI_DIST="$TMPDIR/desktop-cli"
    cli_package=$(bun -e 'import { getCurrentCli } from "./scripts/utils.ts"; console.log(getCurrentCli().package.replace("@chassis/", ""))')



    mkdir -p "$CHASSIS_CLI_DIST/$cli_package/bin"
    cp ${lib.getExe chassis} "$CHASSIS_CLI_DIST/$cli_package/bin/chassis"


    bun -e 'await Bun.write(process.argv[1], JSON.stringify({ version: process.env.CHASSIS_VERSION }) + "\n")' \
      "$CHASSIS_CLI_DIST/$cli_package/package.json"

    bun run build
    npx electron-builder --dir \
      --config electron-builder.config.ts \
      --config.mac.identity=null \
      --config.electronDist="$HOME/.electron-dist"

    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall
  ''
  + lib.optionalString stdenv.hostPlatform.isDarwin ''
    mkdir -p $out/Applications
    mv dist/mac*/*.app $out/Applications
    makeWrapper "$out/Applications/Chassis.app/Contents/MacOS/Chassis" $out/bin/chassis-desktop
  ''
  + lib.optionalString stdenv.hostPlatform.isLinux ''
    mkdir -p $out/opt/chassis-desktop
    cp -r dist/linux*-unpacked/{resources,LICENSE*} $out/opt/chassis-desktop
    install -Dm644 resources/icons/32x32.png \
      "$out/share/icons/hicolor/32x32/apps/ai.chassis.desktop.png"
    install -Dm644 resources/icons/64x64.png \
      "$out/share/icons/hicolor/64x64/apps/ai.chassis.desktop.png"
    install -Dm644 resources/icons/128x128.png \
      "$out/share/icons/hicolor/128x128/apps/ai.chassis.desktop.png"
    install -Dm644 resources/icons/128x128@2x.png \
      "$out/share/icons/hicolor/256x256/apps/ai.chassis.desktop.png"
    install -Dm644 resources/icons/icon.png \
      "$out/share/icons/hicolor/512x512/apps/ai.chassis.desktop.png"
    install -Dm644 resources/ai.chassis.desktop.metainfo.xml \
      "$out/share/metainfo/ai.chassis.desktop.metainfo.xml"
    makeWrapper ${lib.getExe electron} $out/bin/chassis-desktop \
     --inherit-argv0 \
     --set ELECTRON_FORCE_IS_PACKAGED 1 \
     --add-flags $out/opt/chassis-desktop/resources/app.asar \
     --add-flags "\''${NIXOS_OZONE_WL:+\''${WAYLAND_DISPLAY:+--ozone-platform-hint=auto --enable-features=WaylandWindowDecorations --enable-wayland-ime=true}}"
  ''
  + ''
    runHook postInstall
  '';

  autoPatchelfIgnoreMissingDeps = [
    "libc.musl-x86_64.so.1"
  ];

  passthru = {


    electronVersion = electron.version;
    inherit electronPin;
  };

  meta = {
    description = "Chassis Desktop App";
    mainProgram = "chassis-desktop";
    inherit (chassis.meta) homepage license platforms;
  };
})
