//! UDP Broadcast beacon for discovery
//! Ported from TypeScript implementation

use anyhow::Result;
use serde::{Deserialize, Serialize};
use socket2::{Domain, Protocol, Socket, Type};
use std::net::{Ipv4Addr, SocketAddr, UdpSocket};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Duration;
use tracing::{debug, info, warn};

const BEACON_PORT: u16 = 41234;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BeaconMessage {
    pub app: String,
    pub v: u8,
    pub name: String,
    pub audio_port: u16,
    pub ctrl_port: u16,
    pub pair: bool,
    pub code: String,
}

#[derive(Debug, Clone)]
pub struct BeaconConfig {
    pub name: String,
    pub audio_port: u16,
    pub ctrl_port: u16,
}

pub struct BeaconSender {
    config: BeaconConfig,
    running: Arc<AtomicBool>,
    broadcast_addrs: Vec<Ipv4Addr>,
    socket: Option<UdpSocket>,
}

impl BeaconSender {
    pub fn new(config: BeaconConfig) -> Self {
        let mut sender = Self {
            config,
            running: Arc::new(AtomicBool::new(false)),
            broadcast_addrs: vec![Ipv4Addr::BROADCAST],
            socket: None,
        };
        sender.discover_broadcast_addresses();
        sender
    }

    fn discover_broadcast_addresses(&mut self) {
        // Try to discover subnet broadcast addresses
        // For now, just use the global broadcast and common subnet broadcasts
        self.broadcast_addrs = vec![Ipv4Addr::BROADCAST];

        // Try to get local interfaces
        if let Ok(interfaces) = local_interfaces() {
            for iface in interfaces {
                if let Some(ipv4) = iface.ipv4 {
                    if !ipv4.is_loopback() {
                        if let Some(bcast) = calculate_broadcast(ipv4.ip, ipv4.netmask) {
                            if !self.broadcast_addrs.contains(&bcast) {
                                self.broadcast_addrs.push(bcast);
                            }
                        }
                    }
                }
            }
        }

        debug!("Beacon will broadcast to {} addresses", self.broadcast_addrs.len());
    }

    pub fn start(&mut self) -> Result<()> {
        if self.running.load(Ordering::Relaxed) {
            warn!("Beacon already running");
            return Ok(());
        }

        // Create socket
        let socket = Socket::new(Domain::IPV4, Type::DGRAM, Some(Protocol::UDP))?;
        socket.set_broadcast(true)?;
        socket.set_reuse_address(true)?;
        socket.bind(&SocketAddr::new(Ipv4Addr::UNSPECIFIED.into(), BEACON_PORT).into())?;

        let std_socket: UdpSocket = socket.into();
        std_socket.set_nonblocking(true)?;

        self.socket = Some(std_socket.try_clone()?);
        self.running.store(true, Ordering::Relaxed);

        let running = self.running.clone();
        let socket = std_socket;
        let config = self.config.clone();
        let addrs = self.broadcast_addrs.clone();

        thread::spawn(move || {
            Self::broadcast_loop(socket, running, config, addrs);
        });

        info!("Beacon started on port {}", BEACON_PORT);
        Ok(())
    }

    fn broadcast_loop(
        socket: UdpSocket,
        running: Arc<AtomicBool>,
        config: BeaconConfig,
        addrs: Vec<Ipv4Addr>,
    ) {
        let msg = BeaconMessage {
            app: "micshare".to_string(),
            v: 1,
            name: config.name,
            audio_port: config.audio_port,
            ctrl_port: config.ctrl_port,
            pair: false,
            code: "".to_string(),
        };

        let buf = match serde_json::to_vec(&msg) {
            Ok(b) => b,
            Err(e) => {
                warn!("Failed to serialize beacon: {}", e);
                return;
            }
        };

        // Send immediately
        Self::send_beacon(&socket, &buf, &addrs);

        // Then every second
        while running.load(Ordering::Relaxed) {
            thread::sleep(Duration::from_secs(1));
            if !running.load(Ordering::Relaxed) {
                break;
            }
            Self::send_beacon(&socket, &buf, &addrs);
        }
    }

    fn send_beacon(socket: &UdpSocket, buf: &[u8], addrs: &[Ipv4Addr]) {
        for addr in addrs {
            let target = SocketAddr::new((*addr).into(), BEACON_PORT);
            if let Err(e) = socket.send_to(buf, target) {
                debug!("Beacon send error to {}: {}", target, e);
            }
        }
    }

    pub fn stop(&mut self) {
        self.running.store(false, Ordering::Relaxed);
        self.socket = None;
    }
}

impl Drop for BeaconSender {
    fn drop(&mut self) {
        self.stop();
    }
}

/// Listener for discovery beacons (client side)
pub struct BeaconListener {
    socket: Option<UdpSocket>,
    running: Arc<AtomicBool>,
    on_beacon: Option<Arc<dyn Fn(BeaconMessage) + Send + Sync>>,
}

impl BeaconListener {
    pub fn new() -> Self {
        Self {
            socket: None,
            running: Arc::new(AtomicBool::new(false)),
            on_beacon: None,
        }
    }

    pub fn set_callback(&mut self, callback: Arc<dyn Fn(BeaconMessage) + Send + Sync>) {
        self.on_beacon = Some(callback);
    }

    pub fn start(&mut self, on_beacon: impl Fn(BeaconMessage) + Send + Sync + 'static) -> Result<()> {
        if self.running.load(Ordering::Relaxed) {
            return Ok(());
        }

        let socket = Socket::new(Domain::IPV4, Type::DGRAM, Some(Protocol::UDP))?;
        socket.set_reuse_address(true)?;
        socket.bind(&SocketAddr::new(Ipv4Addr::UNSPECIFIED.into(), BEACON_PORT).into())?;

        let std_socket: UdpSocket = socket.into();
        std_socket.set_nonblocking(true)?;

        self.socket = Some(std_socket.try_clone()?);
        self.running.store(true, Ordering::Relaxed);
        self.on_beacon = Some(Arc::new(on_beacon));

        let running = self.running.clone();
        let socket = std_socket;
        let on_beacon = self.on_beacon.clone();

        thread::spawn(move || {
            Self::listen_loop(socket, running, on_beacon);
        });

        info!("Beacon listener started on port {}", BEACON_PORT);
        Ok(())
    }

    fn listen_loop(
        socket: UdpSocket,
        running: Arc<AtomicBool>,
        on_beacon: Option<Arc<dyn Fn(BeaconMessage) + Send + Sync>>,
    ) {
        let mut buf = [0u8; 1024];

        while running.load(Ordering::Relaxed) {
            match socket.recv_from(&mut buf) {
                Ok((len, src)) => {
                    if let Ok(msg) = serde_json::from_slice::<BeaconMessage>(&buf[..len]) {
                        debug!("Received beacon from {}: {:?}", src, msg);
                        if let Some(cb) = &on_beacon {
                            cb(msg);
                        }
                    }
                }
                Err(e) => {
                    if e.kind() == std::io::ErrorKind::WouldBlock {
                        thread::sleep(Duration::from_millis(10));
                        continue;
                    }
                    if running.load(Ordering::Relaxed) {
                        warn!("Beacon listener recv error: {}", e);
                    }
                }
            }
        }
    }

    pub fn stop(&mut self) {
        self.running.store(false, Ordering::Relaxed);
        self.socket = None;
    }
}

impl Drop for BeaconListener {
    fn drop(&mut self) {
        self.stop();
    }
}

/// Get local network interfaces
fn local_interfaces() -> Result<Vec<LocalInterface>> {
    let mut interfaces = Vec::new();

    // Use get_if_addrs crate or parse /proc/net/if_inet6 etc.
    // For now, simple implementation using std
    // In production, use `if_addrs` or `get_if_addrs` crate

    // Fallback: try to get from local ip
    if let Ok(name) = std::env::var("HOSTNAME") {
        debug!("Hostname: {}", name);
    }

    Ok(interfaces)
}

#[derive(Debug)]
struct LocalInterface {
    name: String,
    ipv4: Option<Ipv4Config>,
}

#[derive(Debug)]
struct Ipv4Config {
    ip: Ipv4Addr,
    netmask: Ipv4Addr,
}

impl Ipv4Config {
    fn is_loopback(&self) -> bool {
        self.ip.is_loopback()
    }
}

fn calculate_broadcast(ip: Ipv4Addr, netmask: Ipv4Addr) -> Option<Ipv4Addr> {
    let ip_octets = ip.octets();
    let mask_octets = netmask.octets();
    let mut bcast_octets = [0u8; 4];
    for i in 0..4 {
        bcast_octets[i] = ip_octets[i] | (!mask_octets[i]);
    }
    Some(Ipv4Addr::from(bcast_octets))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_beacon_message_serialization() {
        let msg = BeaconMessage {
            app: "micshare".to_string(),
            v: 1,
            name: "TEST-PC".to_string(),
            audio_port: 41235,
            ctrl_port: 41236,
            pair: false,
            code: "".to_string(),
        };
        let json = serde_json::to_string(&msg).unwrap();
        assert!(json.contains("micshare"));
        assert!(json.contains("TEST-PC"));
    }

    #[test]
    fn test_calculate_broadcast() {
        let ip = Ipv4Addr::new(192, 168, 1, 100);
        let mask = Ipv4Addr::new(255, 255, 255, 0);
        let bcast = calculate_broadcast(ip, mask).unwrap();
        assert_eq!(bcast, Ipv4Addr::new(192, 168, 1, 255));
    }
}