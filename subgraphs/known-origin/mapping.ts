import { Address, log } from "@graphprotocol/graph-ts";
import * as koConstants from "./constants";
import * as accounts from "../../utils/entities/accounts";
import * as contracts from "../../utils/entities/contracts";
import * as nfts from "../../utils/entities/nfts";
import * as saleEvents from "../../utils/entities/saleEvents";
import * as transferEvents from "../../utils/entities/transferEvents";
import { Contract, NFT } from "../../types/schema";
import { ONE } from "../../constants";
import { getMarketInstance } from "./utils/contract";
import { getMetadata } from "./utils/nft";
import {
  Minted,
  PurchaseCall,
  Transfer,
} from "../../types/Known_Origin_Market/Known_Origin_Market";

/*
 * Mint event handler
 *
 * Appends a new NFT to the subgraph.
 * The contract entity is created at the first token's minting.
 */
export function handleMint(e: Minted): void {
  /* Define the minting details from the Minted event. */
  let creatorAddress = e.params._buyer;
  let tokenId = e.params._tokenId;
  let tokenURI = koConstants.BASE_TOKEN_URI.concat(tokenId.toString());
  let metadata = getMetadata(tokenId);

  /* Load the contract instance (create if undefined). */
  let contract = Contract.load(koConstants.CONTRACT_ADDRESS.toHexString());
  if (contract === null) {
    contract = contracts.create(
      koConstants.CONTRACT_ADDRESS,
      koConstants.CONTRACT_URI,
      koConstants.CONTRACT_NAME,
      koConstants.CONTRACT_SYMBOL,
      koConstants.CONTRACT_METADATA
    );
  }
  contract.totalMinted = contract.totalMinted.plus(ONE);
  contract.save();

  /* Load the creator Account instance (create if undefined). */
  let creator = accounts.get(creatorAddress);
  contracts.addCreator(contract as Contract, creator);
  creator.totalCreations = creator.totalCreations.plus(ONE);
  creator.save();

  /* Append the NFT to the subgraph. */
  nfts.create(
    koConstants.CONTRACT_ADDRESS,
    tokenId,
    creatorAddress,
    e.block.number,
    e.transaction.hash,
    e.block.timestamp,
    tokenURI,
    metadata
  );
}

/*
 * Sale event handler
 *
 * Appends a new SaleEvent to the subgraph.
 * Requires existing NFT & Contract entitiies.
 */
export function handleSold(call: PurchaseCall): void {
  /* Define the SaleEvent details from the Purchase call. */
  let tokenId = call.outputs.value0;
  let amount = call.transaction.value;
  let block = call.block.number;
  let hash = call.transaction.hash;
  let timestamp = call.block.timestamp;
  let market = getMarketInstance();
  let owner = market.ownerOf(tokenId);

  /* Require referenced Contract entity. */
  let contractId = koConstants.CONTRACT_ADDRESS.toHexString();
  let contract = Contract.load(koConstants.CONTRACT_ADDRESS.toHexString());
  if (contract === null) {
    log.warning("Contract not found: {}", [contractId]);
    return;
  }

  /* Require referenced NFT entity. */
  let nftId = nfts.getId(koConstants.CONTRACT_ADDRESS, tokenId);
  let nft = NFT.load(nftId);
  if (nft === null) {
    log.warning("NFT not found: {}", [nftId]);
    return;
  }

  /* Append the transaction to the subgraph. */
  let seller = accounts.get(owner);
  let buyer = accounts.get(call.transaction.from);
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
    timestamp
  );
}

/* Event: An NFT was transferred. */
export function handleTransfer(e: Transfer): void {
  /* Define the Transfer details from the event. */
  let fromAddress = e.params._from;
  let toAddress = e.params._to;
  let tokenId = e.params._tokenId;
  let hash = e.transaction.hash;
  let block = e.block.number;
  let timestamp = e.block.timestamp;

  /* Require referenced Contract entity. */
  let contractId = koConstants.CONTRACT_ADDRESS.toHexString();
  let contract = Contract.load(koConstants.CONTRACT_ADDRESS.toHexString());
  if (contract === null) {
    log.warning("Contract not found: {}", [contractId]);
    return;
  }

  /* Require referenced NFT entity. */
  let nftId = nfts.getId(koConstants.CONTRACT_ADDRESS, tokenId);
  let nft = NFT.load(nftId);
  if (nft === null) {
    log.warning("NFT not found: {}", [nftId]);
    return;
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
