// Note: ContradictionStrategy is implemented as a Tier-3 strategy
// but is not currently wired into the Engine runtime (EngineActor).
// It will be wired once the mapping/source for mutually-exclusive pairs
// is provided by the Tier-2 Brain API.
pub mod contradiction;
pub mod implication;
pub mod partition;

#[cfg(test)]
mod tests {
    mod contradiction_tests;
    mod implication_tests;
    mod partition_tests;
}
