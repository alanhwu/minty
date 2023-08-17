import { NextApiRequest, NextApiResponse } from "next"
import { clusterApiUrl, Connection, Keypair, PublicKey } from "@solana/web3.js"
import { getOrCreateAssociatedTokenAccount, createTransferCheckedInstruction, getMint } from "@solana/spl-token"
import { GuestIdentityDriver, keypairIdentity, Metaplex } from "@metaplex-foundation/js"
import base58 from 'bs58'
// import Bundlr from '@bundlr-network/client'
// Update these variables!
// This is returned by nft-upload/upload.js
// const METADATA_URI = "https://arweave.net/Yz2NasIQXB8FVc3a4BK-4mHvl-VU2kzTXiwm2GH0sF0"
//let METADATA_URI =  "https://gateway.pinata.cloud/ipfs/QmZ7Si81sScaAbmCB8CeSCuZxzyidGGDeZVzaYiRq273na"
// Devnet 'fake' USDC, you can get these tokens from https://spl-token-faucet.com/
//const USDC_ADDRESS = new PublicKey("Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr")
const USDC_ADDRESS = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
//const payerKey = process.env.SHOP_PRIVATE_KEY;
// const bundlr = new Bundlr("https://node1.bundlr.network", "solana", payerKey);

// Mainnet USDC, uncomment if using mainnet
// const USDC_ADDRESS = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v")

// Connection endpoint, switch to a mainnet RPC if using mainnet
//const ENDPOINT = clusterApiUrl('devnet')
const ENDPOINT = clusterApiUrl('mainnet-beta');

// This is the name your created NFT will have. Other metadata comes from METADATA_URI
const NFT_NAME = "Minty NFT"

// The amount to charge in USDC
const PRICE_USDC = 0.0001

type InputData = {
  account: string,
  uri: string
}

type GetResponse = {
  label: string,
  icon: string,
}

export type PostResponse = {
  transaction: string,
  message: string,
}

export type PostError = {
  error: string
}

function get(res: NextApiResponse<GetResponse>) {
  res.status(200).json({
    label: "green la croix",
    icon: "https://solana.com/src/img/branding/solanaLogoMark.svg",
  })
}

async function postImpl(account: PublicKey, uri : string): Promise<PostResponse> {
  console.log(`The URI received from the POST request after Solana Pay Scan is: ${uri}`)
  const connection = new Connection(ENDPOINT)

  // Get the shop keypair from the environment variable
  const shopPrivateKey = process.env.SHOP_PRIVATE_KEY
  if (!shopPrivateKey) throw new Error('SHOP_PRIVATE_KEY not found')
  const shopKeypair = Keypair.fromSecretKey(base58.decode(shopPrivateKey))

  // Initialise Metaplex with our shop keypair
  const metaplex = Metaplex
    .make(connection)
    .use(keypairIdentity(shopKeypair))

  const nfts = metaplex.nfts()

  // The mint needs to sign the transaction, so we generate a new keypair for it
  const mintKeypair = Keypair.generate()

  const METADATA_URI = "https://gateway.pinata.cloud/ipfs/" + uri;

  /*
  const METADATA = {
    name: NFT_NAME,
    symbol: "MINTY",
    description: "Minty NFT",
    image: IMAGE_URI,
  }

    // POST request to IPFS with the form data
    const res = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
      method: 'POST',
      headers: {
          'Authorization': `Bearer ${JWT}`
          // Note: Don't set 'Content-Type' here; it will be set automatically with the correct boundary
      },
  });
  */

  console.log(`The metadata uri I've generated is: ${METADATA_URI}`);
  // Create a transaction builder to create the NFT
  const transactionBuilder = await nfts.builders().create({
    uri: METADATA_URI, // use our metadata
    name: NFT_NAME,
    tokenOwner: account, // NFT is minted to the wallet submitting the transaction (buyer)
    updateAuthority: shopKeypair, // we retain update authority
    sellerFeeBasisPoints: 100, // 1% royalty
    useNewMint: mintKeypair, // we pass our mint in as the new mint to use
  })

  // Next we create an instruction to transfer USDC from the buyer to the shop
  // This will be added to the create NFT transaction

  console.log('attempting to find buyer USDC address');
  // Get the buyer's USDC address
  const fromUsdcAddress = await getOrCreateAssociatedTokenAccount(
    connection,
    shopKeypair,
    USDC_ADDRESS,
    account,
  )

  console.log('attempting to find shop USDC address');
  // Get the shop's USDC address
  const toUsdcAddress = await getOrCreateAssociatedTokenAccount(
    connection,
    shopKeypair,
    USDC_ADDRESS,
    shopKeypair.publicKey,
  )

  const usdcMint = await getMint(connection, USDC_ADDRESS)
  const decimals = usdcMint.decimals

  const usdcTransferInstruction = createTransferCheckedInstruction(
    fromUsdcAddress.address, // from USDC address
    USDC_ADDRESS, // USDC mint address
    toUsdcAddress.address, // to USDC address
    account, // owner of the from USDC address (the buyer)
    PRICE_USDC * (10 ** decimals), // multiply by 10^decimals
    decimals
  )

  // Create a guest identity for buyer, so they will be a required signer for the transaction
  const identitySigner = new GuestIdentityDriver(account)

  // Add the USDC payment to the NFT transaction
  transactionBuilder.prepend({
    instruction: usdcTransferInstruction,
    signers: [identitySigner]
  })

  // transactionBuilder.setFeePayer(payerKeypair)

  // Convert to transaction
  const latestBlockhash = await connection.getLatestBlockhash()
  const transaction = await transactionBuilder.toTransaction(latestBlockhash)

  // Partially sign the transaction, as the shop and the mint
  // The account is also a required signer, but they'll sign it with their wallet after we return it
  transaction.sign(shopKeypair, mintKeypair)

  // Serialize the transaction and convert to base64 to return it
  const serializedTransaction = transaction.serialize({
    requireAllSignatures: false // account is a missing signature
  })
  const base64 = serializedTransaction.toString('base64')

  const message = "Transaction to mint your NFT!"

  // Return the serialized transaction
  return {
    transaction: base64,
    message,
  }
}

async function post(
  req: NextApiRequest,
  res: NextApiResponse<PostResponse | PostError>
) {
  const { account } = req.body as InputData
  const uri = req.query.uri as string;
  console.log(req.body)
  console.log(`for the account req body we are printing out: ${JSON.stringify(req.body)}`)
  if (!account) {
    res.status(400).json({ error: "No account provided" })
    return
  }

  try {
    const mintOutputData = await postImpl(new PublicKey(account), uri);
    res.status(200).json(mintOutputData)
    console.log(`for mintOutputData we are printing out: ${JSON.stringify(mintOutputData)}`)
    return
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'error creating transaction' })
    return
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GetResponse | PostResponse | PostError>
) {
  if (req.method === "GET") {
    return get(res)
  } else if (req.method === "POST") {
    return await post(req, res)
  } else {
    return res.status(405).json({ error: "Method not allowed" })
  }
}
