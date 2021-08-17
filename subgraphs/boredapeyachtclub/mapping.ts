
import { BigInt, Address, Bytes, TypedMap } from "@graphprotocol/graph-ts"
import * as baycConstants from "./constants"
import * as accounts from "../../utils/entities/accounts";
import * as contracts from "../../utils/entities/contracts";
import * as nfts from "../../utils/entities/nfts";
import * as saleEvents from "../../utils/entities/saleEvents";
import * as transferEvents from "../../utils/entities/transferEvents"

import { Contract, NFT } from "../../types/schema";
import { ONE, ZERO_ADDRESS } from "../../constants";
import { isSingleTrade, decodeCallData } from "./utils/opensea"
import { getMetadata } from "./utils/nft";
import { getContract } from "./utils/contract";

import {
  AtomicMatch_Call
} from "../../types/BAYC_OpenSea_Market/OpenSea_Market"
import {
  Transfer
} from "../../types/BAYC_ERC721/BAYC_ERC721"



export function handleTransfer(e: Transfer): void {
  let fromAddress = e.params.from;
  let toAddress = e.params.to;
  let tokenId = e.params.tokenId;
  let hash = e.transaction.hash;
  let block = e.block.number;
  let timestamp = e.block.timestamp;
  let contract = getContract();

  /* Require referenced NFT entity. */
  let nftId = nfts.getId(baycConstants.CONTRACT_ADDRESS, tokenId);
  let nft = NFT.load(nftId);
  if (nft === null) {
    nft = mint(tokenId, block, hash, timestamp);
  }

  /* Append the transaction to the subgraph. */
  let from = accounts.get(fromAddress);
  let to = accounts.get(toAddress);

  transferEvents.create(
    nft as NFT,
    contract as Contract,
    from,
    to,
    block,
    hash,
    timestamp
  );

}

export function handleOpenSeaSale(call: AtomicMatch_Call): void {
  let calldataBuy = call.inputs.calldataBuy.toHexString()
  let calldataSell = call.inputs.calldataSell.toHexString()
  // Only allow single sale events (not bundle)
  if (isSingleTrade(calldataBuy, calldataSell)) {
    let addrs = call.inputs.addrs
    let nftAddress = addrs[4]
    // Only allow Meebits sale events
    if (nftAddress.toHexString() == baycConstants.CONTRACT_ADDRESS.toHexString()) {
      let uints = call.inputs.uints
      // decode opensea calldata
      let buyReplacement = call.inputs.replacementPatternBuy.toHexString()
      let decodedCallData: TypedMap<string, string> = decodeCallData(calldataBuy, buyReplacement, calldataSell)
      // Define the SaleEvent info
      let buyer = accounts.get(Address.fromString(decodedCallData.get("buyer") as string))
      let seller = accounts.get(Address.fromString(decodedCallData.get("seller") as string))
      let tokenId = BigInt.fromString(decodedCallData.get("tokenId") as string)
      let paymentToken = addrs[6]
      let amount = uints[4]
      let block = call.block.number;
      let hash = call.transaction.hash;
      let timestamp = call.block.timestamp;
      let contract = getContract();

      // create nft
      let nftId = nfts.getId(baycConstants.CONTRACT_ADDRESS, tokenId)
      let nft = NFT.load(nftId);
      if (nft === null) {
        nft = mint(tokenId, block, hash, timestamp);
      }

      /* Append the transaction to the subgraph. */
      let creator = accounts.get(Address.fromString(nft.creator));
      contracts.addBuyer(contract as Contract, buyer);
      contracts.addSeller(contract as Contract, seller);
      saleEvents.create(
        nft as NFT,
        contract as Contract,
        buyer,
        seller,
        creator,
        amount,
        block,
        hash,
        timestamp,
        "{}",
        paymentToken.toHexString()
      )
    }
  }
}

export function mint(
  tokenId: BigInt,
  block: BigInt,
  hash: Bytes,
  timestamp: BigInt
): NFT {
  /* Define the minting details from the Minted event. */
  let tokenURI = baycConstants.BASE_TOKEN_URI.concat(tokenId.toString());
  let metadata = getMetadata(tokenId);
  let creatorAddress = Address.fromHexString(ZERO_ADDRESS) as Address

  /* Load the contract instance (create if undefined). */
  let contract = getContract();
  contract.totalMinted = contract.totalMinted.plus(ONE);
  contract.save();

  /* Load the creator Account instance (create if undefined). */
  let creator = accounts.get(creatorAddress);
  contracts.addCreator(contract as Contract, creator);
  creator.totalCreations = creator.totalCreations.plus(ONE);
  creator.save();

  /* Append the NFT to the subgraph. */
  return nfts.create(
    baycConstants.CONTRACT_ADDRESS,
    tokenId,
    creatorAddress,
    block,
    hash,
    timestamp,
    tokenURI,
    metadata
  );
}