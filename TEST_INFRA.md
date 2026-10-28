# E2E Test Infra: Rayclone Beyond-Raycast Power User Extension Suite

## Test Philosophy
- Opaque-box, requirement-driven.
- Derived strictly from `ORIGINAL_REQUEST.md` (R1: Developer Tooling, R2: Windows Superpowers, R3: Media & Desktop Innovations, R4: Versioning, Verification & Distribution).
- Zero dependency on internal implementation details; assertions validate public module APIs, search queries, actions, preview models, and headless resiliency.
- Methodology: Category-Partition + Boundary Value Analysis + Pairwise Interactions + Real-World Workloads.

## Feature Inventory & Test Coverage
| # | Feature | Source (Requirement) | Tier 1 | Tier 2 | Tier 3 | Tier 4 |
|---|---------|----------------------|:------:|:------:|:------:|:------:|
| 1 | Port & Socket Inspector | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ | ✓ |
| 2 | Local Git Repositories Indexer | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ | ✓ |
| 3 | Docker & Container Manager | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ | ✓ |
| 4 | GitHub / GitLab Shortcuts | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ | ✓ |
| 5 | Audio Output & Mic Device Switcher | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ | ✓ |
| 6 | Windows Services Manager | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ | ✓ |
| 7 | Environment Variables Manager | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ | ✓ |
| 8 | Package Manager Updater (`winget`) | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ | ✓ |
| 9 | Hosts File Quick Editor | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ | ✓ |
| 10 | SMTC / Media Now Playing HUD | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ | ✓ |
| 11 | Floating Detached Scratchpad / HUD Mode | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ | ✓ |
| 12 | Parameterized Quicklinks | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ | ✓ |

## Test Architecture
- **Primary Test Runner**: `tools/test-suite.mjs`
- **Invocation**: `node tools/test-suite.mjs`
- **Pass/Fail Semantics**: Exit code 0 on complete success; non-zero exit code on any assertion failure with explicit trace.
- **Sandboxed Storage**: Isolated filesystem state via `.cache/test-verify-<timestamp>` ensuring zero mutation of production user data.
- **Headless Resiliency**: Safe execution in CI / headless environments without native desktop sessions.

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Complexity |
|---|----------|--------------------|------------|
| 1 | Full-Stack Dev Workflow | Port Inspector + Git Indexer + Docker Manager | High |
| 2 | System Administration | Services Manager + Env Vars Manager + Hosts File Editor | High |
| 3 | Workstation Setup & Maintenance | Winget Package Updater + Audio Switcher | Medium |
| 4 | Multitasking & Media Focus | SMTC Media HUD + Floating Detached HUD + Focus Session | High |
| 5 | Issue Triage & Quick Access | Parameterized Quicklinks + GitHub/GitLab Shortcuts | Medium |

## Coverage Thresholds
- Tier 1: ≥5 test cases per feature (12 × 5 = 60 test cases)
- Tier 2: ≥5 boundary & error test cases per feature (12 × 5 = 60 test cases)
- Tier 3: Pairwise cross-feature combinations (≥12 interaction scenarios)
- Tier 4: ≥5 realistic end-to-end application scenarios
- **Total Suite**: ≥137 test assertions across the beyond-Raycast extension suite while preserving 100% of the 22 existing verification suites.
