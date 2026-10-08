# PondSOL evidence backup: guarantees and limitations

## Scope

The PondSOL simulation evidence backup is an evidence-preservation
mechanism. It is not a consistent filesystem snapshot, recovery
mechanism, trading authorization, or proof of exclusive access.

## Manifest safety contract

- `recoveryAuthorized` must remain `false`.
- `exclusiveAccessVerified` must remain `false`.
- Successful copying is reported as
  `EVIDENCE_COPIED_NOT_CONSISTENCY_GUARANTEED`.
- Detected failures are reported as `INCOMPLETE` when the manifest
  can be persisted.
- Manifest persistence itself may fail when a directory has been
  replaced or is no longer accessible.

## Existing protections

The backup checks SHA-256 hashes, file sizes, source file identities,
selected directory identities, lock directory identity, and expected
directory entries.

These checks detect the tested persistent modifications and
replacements. They do not establish continuous immutability.

## 2C-C11 experimental findings

All experiments used isolated TEMP fixtures and instrumented copies
of the backup script.

1. Persistent snapshot modification after copying was rejected.
2. Identical-content source file replacement was rejected because
   the source file identity changed.
3. Transient ancestor movement followed by restoration was not
   detected by the final identity checks.
4. Transient source-content modification followed by byte-for-byte
   restoration was not detected by the final hash and identity checks.
5. The two tested Windows directory-handle configurations did not
   prevent renaming while their handles remained open.

The undetected transient changes do not, by themselves, demonstrate
corrupted evidence or an inconsistent copied dataset.

## Residual risk

File hashes and identities are sampled at distinct points in time.
A change that occurs and is reversed between observations may remain
undetected.

The backup must therefore never be represented as an atomic,
exclusive-access, or consistency-guaranteed snapshot.

## Recovery policy

RECOVERY AUTHORIZED: NO

The backup must not automatically restore state, connect wallets,
execute trades, or authorize financial operations.

## Regression policy

The regression suite must continue to verify the manifest safety
contract and rejection of tested persistent changes.

Simulation only.