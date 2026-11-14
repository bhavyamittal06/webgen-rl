# webgen-rl

Post-training a small code LLM to generate working web components, using verifiable rewards (build, lint, render, assertions). Includes an eval harness and regression tracing across checkpoints.

## Goal
Take a small open model (Qwen2.5-Coder 1.5B), measure a baseline, then improve it with SFT, GRPO and DPO, and report what worked and what failed.

## Log
### 2026-11-14
- Created repo and folder structure.
