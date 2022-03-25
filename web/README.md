# Web demo for Auction Lens protocols

This assumes that you run the following first in a lens protocol checkout (e.g. in `../lens-protocol` submodule)

```
npm hardhat node
npm run full-deploy-local
```

Then in the `contracts/` subdir of this repository run

```
npx hardhat setup-demo --network localhost
```

## Run locally

Pull the repository, run 
```
pnpm i
pnpm dev
```

The site is then available at localhost:3000

