{
  description = "Presto - Terminal-based pull request discovery and management tool";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};

        version = (builtins.fromJSON (builtins.readFile ./package.json)).version;

        bunDeps = pkgs.stdenvNoCC.mkDerivation {
          pname = "presto-deps";
          inherit version;
          src = pkgs.lib.cleanSourceWith {
            src = ./.;
            filter = path: type:
              let baseName = builtins.baseNameOf path; in
              baseName == "package.json" || baseName == "bun.lock";
          };

          nativeBuildInputs = [ pkgs.bun ];

          buildPhase = ''
            export HOME=$TMPDIR
            bun install --frozen-lockfile
          '';

          installPhase = ''
            cp -r node_modules $out
          '';

          outputHashAlgo = "sha256";
          outputHashMode = "recursive";
          outputHash = "sha256-jIzDxDOviOzhyfel2l8aTaAkGFBfItxCgBPj5oVQ9AU=";
        };

      in {
        packages.default = pkgs.stdenvNoCC.mkDerivation {
          pname = "presto";
          inherit version;
          src = pkgs.lib.cleanSource ./.;

          nativeBuildInputs = [ pkgs.bun pkgs.makeWrapper ];

          buildPhase = ''
            export HOME=$TMPDIR
            cp -r ${bunDeps} node_modules
            chmod -R u+w node_modules
            bun scripts/build.ts
          '';

          installPhase = ''
            install -Dm755 dist/presto $out/bin/presto
            wrapProgram $out/bin/presto \
              --prefix PATH : ${pkgs.lib.makeBinPath [ pkgs.gh pkgs.git ]}
          '';
        };

        devShells.default = pkgs.mkShell {
          packages = with pkgs; [
            bun
            just
            gh
            typescript
            git
          ];

          shellHook = ''
            echo "presto dev shell"
            echo "  bun $(bun --version) | just $(just --version | head -1) | gh $(gh --version | head -1)"
          '';
        };
      }
    );
}
