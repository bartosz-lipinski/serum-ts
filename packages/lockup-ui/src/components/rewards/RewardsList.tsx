import React, { useState } from 'react';
import BN from 'bn.js';
import CircularProgress from '@material-ui/core/CircularProgress';
import LockIcon from '@material-ui/icons/Lock';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListItemText from '@material-ui/core/ListItemText';
import Collapse from '@material-ui/core/Collapse';
import Typography from '@material-ui/core/Typography';
import ExpandLess from '@material-ui/icons/ExpandLess';
import ExpandMore from '@material-ui/icons/ExpandMore';
import * as registry from '@project-serum/registry';
import { PoolState } from '@project-serum/pool';
import { Network, ProgramAccount } from '@project-serum/common';

type RewardsListProps = {
  rewards: RewardListItemViewModel[];
  network: Network;
};

export default function RewardsList(props: RewardsListProps) {
  const { rewards, network } = props;
  return (
    <List>
      {rewards.length > 0 ? (
        rewards.map(r => <RewardListItem network={network} rli={r} />)
      ) : (
        <ListItem>
          <ListItemText primary={'No rewards found'} />
        </ListItem>
      )}
    </List>
  );
}

type RewardListItemProps = {
  rli: RewardListItemViewModel;
  network: Network;
};

function RewardListItem(props: RewardListItemProps) {
  const { rli, network } = props;
  if (rli.reward.poolDrop !== undefined) {
    return (
      <PoolRewardListItem cursor={rli.cursor} poolDrop={rli.reward.poolDrop} />
    );
  } else {
    return <LockUnlockRewardListItem rli={rli} network={network} />;
  }
}

type PoolRewardListItemProps = {
  poolDrop: registry.accounts.PoolDrop;
  cursor: number;
};

function PoolRewardListItem(props: PoolRewardListItemProps) {
  const { poolDrop, cursor } = props;

  let amountLabel = `${poolDrop.totals[0].toString()} SRM`;
  if (poolDrop.totals.length === 2) {
    amountLabel += ` ${poolDrop.totals[1].toString()} MSRM`;
  }
  let lockedLabel = 'unlocked';
  let fromLabel = `${poolDrop.pool.toString()} | ${poolDrop.from.toString()} | ${cursor}`;
  return (
    <>
      <ListItem button>
        <LockIcon style={{ visibility: 'hidden', marginRight: '16px' }} />
        <ListItemText
          primary={<>{`${amountLabel} ${lockedLabel}`}</>}
          secondary={fromLabel}
        />
      </ListItem>
    </>
  );
}

type LockUnlockRewardListItemProps = {
  network: Network;
  rli: RewardListItemViewModel;
};

function LockUnlockRewardListItem(props: LockUnlockRewardListItemProps) {
  const { rli, network } = props;

  const rewardEvent = rli.reward.lockedAlloc ?? rli.reward.unlockedAlloc!;

  const [open, setOpen] = useState(false);
  let amountLabel = `${rewardEvent.total.toString()}`;
  if (rewardEvent.mint.equals(network.srm)) {
    amountLabel += ' SRM';
  } else if (rewardEvent.mint.equals(network.msrm)) {
    amountLabel += ' MSRM';
  } else {
    amountLabel += ` ${rewardEvent.mint}`;
  }
  let lockedLabel = 'vendored';
  let fromLabel = `${rewardEvent.pool.toString()} | ${rewardEvent.from.toString()} | ${
    rli.cursor
  }`;

  return (
    <>
      <ListItem button onClick={() => setOpen(open => !open)}>
        <LockIcon
          style={{
            visibility:
              rli.reward.lockedAlloc === undefined ? 'hidden' : 'visible',
            marginRight: '16px',
          }}
        />
        <ListItemText
          primary={
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                color: rli.needsClaim ? '#54a15e' : '',
              }}
            >
              <div>{`${amountLabel} ${lockedLabel}`}</div>
            </div>
          }
          secondary={fromLabel}
        />
        {open ? <ExpandLess /> : <ExpandMore />}
      </ListItem>
      <Collapse in={open} timeout="auto" unmountOnExit>
        {rli.vendor === undefined ? (
          <CircularProgress />
        ) : (
          <LockUnlockRewardDetails vendor={rli.vendor} />
        )}
      </Collapse>
    </>
  );
}

type LockUnlockRewardDetailsProps = {
  vendor: ProgramAccount<
    | registry.accounts.LockedRewardVendor
    | registry.accounts.UnlockedRewardVendor
  >;
};

function LockUnlockRewardDetails(props: LockUnlockRewardDetailsProps) {
  let { vendor } = props;

  return (
    <div
      style={{
        marginLeft: '56px',
      }}
    >
      <Typography variant="h6">Vendor</Typography>
      <Typography>Address: {vendor.publicKey.toString()}</Typography>
      <Typography>Vault: {vendor.account.vault.toString()}</Typography>
      <Typography>
        Pool token supply snapshot: {vendor.account.poolTokenSupply.toString()}
      </Typography>
      <Typography>
        Expiry:{' '}
        {new Date(
          vendor.account.expiryTs.toNumber() * 1000,
        ).toLocaleDateString()}
      </Typography>
      <Typography>
        Expiry receiver: {vendor.account.expiryReceiver.toString()}
      </Typography>
    </div>
  );
}

export class RewardListItemViewModel {
  constructor(
    readonly reward: registry.accounts.RewardEvent,
    readonly cursor: number,
    readonly needsClaim: boolean,
    readonly vendor?: ProgramAccount<
      | registry.accounts.LockedRewardVendor
      | registry.accounts.UnlockedRewardVendor
    >,
  ) {}

  static fromMessage(
    ctx: Context,
    event: registry.accounts.RewardEvent,
    idx: number,
  ): RewardListItemViewModel {
    let cursor = ctx.rewardEventQueue!.account.tailCursor() + idx;
    let needsClaim = false;
    let vendor = undefined;
    if (event.lockedAlloc !== undefined || event.unlockedAlloc !== undefined) {
      const eventInner = event.lockedAlloc
        ? event.lockedAlloc
        : event.unlockedAlloc!;
      vendor = ctx.vendors.get(eventInner.vendor.toString());
      if (vendor !== undefined) {
        // The member must own shares of the reward's target pool.
        const ownsPoolShares = eventInner.pool.equals(ctx.pool.publicKey)
          ? ctx.member.account.balances.sptAmount.cmp(new BN(0)) === 1
          : ctx.member.account.balances.sptMegaAmount.cmp(new BN(0)) === 1;
        const notYetClaimed = cursor >= ctx.member.account.rewardsCursor;
        const isEligible =
          ctx.member.account.lastStakeTs < vendor.account.startTs;

        needsClaim = ownsPoolShares && notYetClaimed && isEligible;
      }
    }
    return new RewardListItemViewModel(event, cursor, needsClaim, vendor);
  }
}

type Context = {
  rewardEventQueue: ProgramAccount<registry.accounts.RewardEventQueue>;
  member: ProgramAccount<registry.accounts.Member>;
  network: Network;
  vendors: Map<
    string,
    ProgramAccount<
      | registry.accounts.LockedRewardVendor
      | registry.accounts.UnlockedRewardVendor
    >
  >;
  pool: ProgramAccount<PoolState>;
};