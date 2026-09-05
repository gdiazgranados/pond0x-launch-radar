const TOKENS = Object.freeze({
  pndc: {
    id: "pndc",
    symbol: "PNDC",
    name: "Pond Coin",
    chain: "ethereum",
    chainId: "ethereum",
    address: "0x423f4e6138E475D85CF7Ea071AC92097Ed631eea",
    decimals: 18,
    family: "core",
    preferredQuoteAssets: ["WETH", "USDC"],
    evidence: [
      "https://docs.pond0x.com/",
      "https://etherscan.io/address/0x423f4e6138E475D85CF7Ea071AC92097Ed631eea"
    ]
  },
  pork: {
    id: "pork",
    symbol: "PORK",
    name: "PepeFork",
    chain: "ethereum",
    chainId: "ethereum",
    address: "0xb9f599ce614feb2e1bbe58f180f370d05b39344e",
    decimals: 18,
    family: "core",
    preferredQuoteAssets: ["WETH", "USDC", "PNDC"],
    evidence: [
      "https://etherscan.io/token/0xb9f599ce614feb2e1bbe58f180f370d05b39344e"
    ]
  },
  wpond: {
    id: "wpond",
    symbol: "wPOND",
    name: "POND COIN - WARPED",
    chain: "solana",
    chainId: "solana",
    address: "3JgFwoYV74f6LwWjQWnr3YDPFnmBdwQfNyubv99jqUoq",
    decimals: null,
    family: "core",
    preferredQuoteAssets: ["SOL", "USDC"],
    evidence: [
      "https://www.pond0x.com/solana/leaderboard"
    ]
  },
  paper: {
    id: "paper",
    symbol: "PAPER",
    name: "PAPER",
    chain: "solana",
    chainId: "solana",
    address: "PAPERu8xjrqfjBLj8XG6FCiokuk7pG1GzUbRTYwX1nU",
    decimals: null,
    family: "event",
    preferredQuoteAssets: ["USDC", "SOL"],
    evidence: [
      "https://www.solflare.com/pt-pt/precos/paper/PAPERu8xjrqfjBLj8XG6FCiokuk7pG1GzUbRTYwX1nU/"
    ]
  }
});

function listTokens() {
  return Object.values(TOKENS);
}

module.exports = { TOKENS, listTokens };
