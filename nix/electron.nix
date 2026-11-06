{ lib, pkgs, electronPin }:
let





  major = lib.versions.major electronPin;
in
pkgs."electron_${major}-bin" or (throw "nixpkgs ${lib.version} carries no prebuilt electron ${major}: run `nix flake update nixpkgs`, or pin a major nixpkgs still carries")
