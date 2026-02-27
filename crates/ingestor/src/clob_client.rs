use polymarket_client_sdk::clob::ws::Client;

pub struct ClobClientWrapper {
    pub client: Client,
}

impl Default for ClobClientWrapper {
    fn default() -> Self {
        Self::new()
    }
}

impl ClobClientWrapper {
    pub fn new() -> Self {
        Self {
            client: Client::default(),
        }
    }
}
