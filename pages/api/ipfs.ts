import { NextApiRequest, NextApiResponse } from "next"
import { clusterApiUrl, Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from "@solana/web3.js"
import { getOrCreateAssociatedTokenAccount, createTransferCheckedInstruction, getMint } from "@solana/spl-token"
import { GuestIdentityDriver, keypairIdentity, Metaplex } from "@metaplex-foundation/js"
import { ValidDepthSizePair, getConcurrentMerkleTreeAccountSize, createAllocTreeIx, SPL_ACCOUNT_COMPRESSION_PROGRAM_ID, SPL_NOOP_PROGRAM_ID } from "@solana/spl-account-compression"
import base58 from 'bs58'

import { PROGRAM_ID as BUBBLEGUM_PROGRAM_ID, createCreateTreeInstruction, MetadataArgs, TokenProgramVersion, TokenStandard, createMintToCollectionV1Instruction } from "@metaplex-foundation/mpl-bubblegum"
import { parseJsonConfigFileContent } from "typescript"

import { createQR, encodeURL, TransactionRequestURLFields } from '@solana/pay'
import QRCodeStyling from '@solana/qr-code-styling';

const ENDPOINT = clusterApiUrl('mainnet-beta');

const shopPrivateKey = process.env.SHOP_PRIVATE_KEY
if (!shopPrivateKey) throw new Error('SHOP_PRIVATE_KEY not found')
const shopKeypair = Keypair.fromSecretKey(base58.decode(shopPrivateKey))
const payer = shopKeypair;

type InputData = {
  uri: string,
  account: string
}

type GetResponse = {
  label: string,
  icon: string,
}

export type PostResponse = {
  //transaction: string,
  message: string,
  mintURL: string
}

export type PostError = {
  error: string
}

let compressedNFTMetadata: MetadataArgs = {
    name: "green la croix",
    symbol: "GLC",
    //WE GOTTA OVERRIDE THIS ONE
    uri: null,
    creators: null,
    editionNonce: 0,
    uses: null,
    collection: null,
    primarySaleHappened: false,
    sellerFeeBasisPoints: 0,
    isMutable: false,
    tokenProgramVersion: TokenProgramVersion.Original,
    tokenStandard: TokenStandard.NonFungible
}

function get(res: NextApiResponse<GetResponse>) {
    console.log('someone asked me for a get!');
  res.status(200).json({
    label: "green la croix",
    icon: "https://solana.com/src/img/branding/solanaLogoMark.svg",
  })
}

async function postImpl(uri: string): Promise<PostResponse> {
  // Return the serialized transaction'
  const connection = new Connection(ENDPOINT);

  const apiUrl = 'https://bass-uncommon-repeatedly.ngrok-free.app/api/checkout?uri=' + uri;
  
  
//   const mintUrlFields: TransactionRequestURLFields = {
//     link: new URL(apiUrl),
//   }
//   const mintUrl = encodeURL(mintUrlFields).toString();

 const mintUrl = apiUrl;
 console.log(`The mint URL we are responding with is: ${mintUrl}`)
  // const mintQr = createQR(mintUrl, 400, 'transparent')





/*
  // derive a PDA (owned by Bubblegum) to act as the signer of the compressed minting
  const [bubblegumSigner, _bump2] = PublicKey.findProgramAddressSync(
    // `collection_cpi` is a custom prefix required by the Bubblegum program
    [Buffer.from("collection_cpi", "utf8")],
    BUBBLEGUM_PROGRAM_ID,
  );

*/

    //Craft the transaction: Mint using the URI, transfer to the user in exchange for SOL

    /*
    const compressedMintIx = createMintToCollectionV1Instruction(
        {
            payer: payer.publicKey,
        
            merkleTree: new PublicKey("GYs6A4hRZnDh9abpstWoh5NpqUYykGkfhoyeDnHE4FrL"),
            treeAuthority: new PublicKey("7eJBzemFDwhD1nr5yukX2kmae88FqAgcCLAnE9jgnGAG"),
            treeDelegate: payer.publicKey,
        
            // set the receiver of the NFT
            leafOwner: receiverAddress || payer.publicKey,
            // set a delegated authority over this NFT
            leafDelegate: payer.publicKey,
        
            // collection details
            collectionAuthority: payer.publicKey,
            collectionAuthorityRecordPda: BUBBLEGUM_PROGRAM_ID,
            collectionMint: collectionMint,
            collectionMetadata: collectionMetadata,
            editionAccount: collectionMasterEditionAccount,
        
            // other accounts
            bubblegumSigner: bubblegumSigner,
            compressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
            logWrapper: SPL_NOOP_PROGRAM_ID,
            tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
        },
        {
            metadataArgs: Object.assign(compressedNFTMetadata, {
            collection: { key: collectionMint, verified: false },
            }),
        },
        );
    */



    return {
        message: "hey i got it.",
        mintURL: mintUrl
    }

}


async function post(
  req: NextApiRequest,
  res: NextApiResponse<PostResponse | PostError>
) {
  // const { uri, account } = req.body as InputData
  // console.log(req.body)
  // console.log(`for the account req body we are printing out: ${JSON.stringify(req.body)}`)
  
  const uri = req.query.uri as string;
  if (!uri) {
    res.status(400).json({ error: "No uri hash provided" })
    return
  }

  try {
    const qrCode = await postImpl(uri);
    // send the QR Code back to the user
    res.status(200).json(qrCode);
    // res.status(200).json(mintOutputData)
    // console.log(`we are sending back: ${JSON.stringify(mintOutputData)}`)
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
    const uri = req.query.uri as string
    console.log(`The URI received from the POST request after IPFS pin is: ${uri}`);
    return await post(req, res)
  } else {
    return res.status(405).json({ error: "Method not allowed" })
  }
}


/* here's the code that I used to make my tree!

const maxDepth = 5;
const maxBufferSize = 8;
const canopyDepth = 0;


const requiredSpace = getConcurrentMerkleTreeAccountSize(
    maxDepth,
    maxBufferSize,
    canopyDepth
  );

  const storageCost = await connection.getMinimumBalanceForRentExemption(
    requiredSpace
  ) / 10 ** 9;


  const maxDepthSizePair: ValidDepthSizePair = {
    maxDepth,
    maxBufferSize,
  }

  const treeKeypair = Keypair.generate();
    // derive the tree's authority (PDA), owned by Bubblegum
    const [treeAuthority, _bump] = PublicKey.findProgramAddressSync(
        [treeKeypair.publicKey.toBuffer()],
        BUBBLEGUM_PROGRAM_ID,
    );

// allocate the tree's account on chain with the `space`
const allocTreeIx = await createAllocTreeIx(
    connection,
    treeKeypair.publicKey,
    payer.publicKey,
    maxDepthSizePair,
    canopyDepth,
);

const createTreeIx = createCreateTreeInstruction(
    {
        payer: payer.publicKey,
        treeCreator: payer.publicKey,
        treeAuthority,
        merkleTree: treeKeypair.publicKey,
        compressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
        // NOTE: this is used for some on chain logging
        logWrapper: SPL_NOOP_PROGRAM_ID,
    },
    {
        maxBufferSize: maxDepthSizePair.maxBufferSize,
        maxDepth: maxDepthSizePair.maxDepth,
        public: false,
    },
    BUBBLEGUM_PROGRAM_ID,
    );

 // build the transaction
const tx = new Transaction().add(allocTreeIx).add(createTreeIx);
tx.feePayer = payer.publicKey;

// send the transaction

// I used this to create my empty tree
const txSignature = await sendAndConfirmTransaction(
  connection,
  tx,
  // ensuring the `treeKeypair` PDA and the `payer` are BOTH signers
  [treeKeypair, payer],
  {
    commitment: "confirmed",
    skipPreflight: true,
  },
);

*/