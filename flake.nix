{
  description = "Cappa Dev Environment";
  inputs.flake-utils.url = "github:numtide/flake-utils"; # utilities for building nix flakes
  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable"; # unstable packages from 'main'
  inputs.playwright.url = "github:pietdevries94/playwright-web-flake/1.55.0"; # playwright browsers

  outputs = { self, flake-utils, nixpkgs, playwright }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        overlay = final: prev: {
          inherit (playwright.packages.${system}) playwright-test playwright-driver;
        };

        pkgs = import nixpkgs {
          inherit system;
          overlays = [ overlay ];
        };
      in
      {
        devShells = {
          default = pkgs.mkShell {
            packages = [
              pkgs.playwright-test
            ];
            shellHook = ''
              export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
              export PLAYWRIGHT_BROWSERS_PATH="${pkgs.playwright-driver.browsers}"
            '';
          };
        };
      });
}
