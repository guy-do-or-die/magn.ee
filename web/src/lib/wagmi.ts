import { http, createConfig } from 'wagmi'
import { mainnet, arbitrum, base, optimism } from 'wagmi/chains'

export const wagmiConfig = createConfig({
  chains: [mainnet, arbitrum, base, optimism],
  transports: {
    [mainnet.id]: http(),
    [arbitrum.id]: http(),
    [base.id]: http(),
    [optimism.id]: http(),
  },
})
