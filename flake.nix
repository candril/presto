# presto packaged from its GitHub release binary — the same .gz and SHA256SUMS the curl
# installer and the Homebrew formula verify against. release.json is written by the release
# workflow the moment a release is published, so `nix run github:candril/presto` is the
# newest release without any hand edit. (Building from source under Nix would need a
# fixed-output hash for the bun dependency tree, which differs per platform and changes with
# every bun.lock edit.)
#
# Generated from candril/homebrew-tap/templates/flake.nix; edit it there.
{
  description = "presto — packaged from its GitHub releases";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";

  outputs = { self, nixpkgs }:
    let
      lib = nixpkgs.lib;
      systems = [ "aarch64-darwin" "x86_64-darwin" "aarch64-linux" "x86_64-linux" ];
      target = {
        aarch64-darwin = "darwin-arm64";
        x86_64-darwin = "darwin-x64";
        aarch64-linux = "linux-arm64";
        x86_64-linux = "linux-x64";
      };
      rel = builtins.fromJSON (builtins.readFile ./release.json);
      forAll = f: lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system} system);
    in
    {
      packages = forAll (pkgs: system:
        let
          t = target.${system};
          runtime = map (p: pkgs.${p}) [ "gh" "git" ];
          isLinux = pkgs.stdenv.hostPlatform.isLinux;
        in
        rec {
          default = presto;
          presto = pkgs.stdenvNoCC.mkDerivation {
            pname = "presto";
            version = rel.version;

            src = pkgs.fetchurl {
              url = "https://github.com/candril/presto/releases/download/v${rel.version}/presto-${t}.gz";
              sha256 = rel.sha256.${t};
            };
            dontUnpack = true;

            nativeBuildInputs = [ pkgs.makeWrapper ] ++ lib.optionals isLinux [ pkgs.autoPatchelfHook ];
            # Bun-compiled binaries link glibc and libstdc++ dynamically.
            buildInputs = lib.optionals isLinux [ pkgs.stdenv.cc.cc.lib ];

            installPhase = ''
              runHook preInstall
              mkdir -p $out/bin
              gunzip -c $src > $out/bin/presto
              chmod +x $out/bin/presto
              ${lib.optionalString (runtime != [ ]) ''
                wrapProgram $out/bin/presto --prefix PATH : ${lib.makeBinPath runtime}
              ''}
              runHook postInstall
            '';

            meta = {
              description = "Pull requests in the terminal: every repo you watch, one list, whose move it is";
              homepage = "https://candril.github.io/presto/";
              license = lib.licenses.mit;
              mainProgram = "presto";
              platforms = systems;
            };
          };
        });

      devShells = forAll (pkgs: _: {
        default = pkgs.mkShell {
          packages = with pkgs; [ bun just gh git typescript ];
        };
      });
    };
}
