//! Cálculo dos endereços de broadcast do beacon de descoberta.
//!
//! O PC anuncia em `255.255.255.255` (broadcast global) e também no broadcast
//! de cada sub-rede IPv4 ativa — redes que filtram broadcast global ainda
//! recebem o beacon (ver `docs/arquitetura.md` §6).

use std::net::{Ipv4Addr, SocketAddr};

use if_addrs::IfAddr;

/// Calcula o endereço de broadcast de uma sub-rede a partir do IP e da máscara.
#[must_use]
pub fn subnet_broadcast(ip: Ipv4Addr, netmask: Ipv4Addr) -> Ipv4Addr {
    let ip = u32::from(ip);
    let mask = u32::from(netmask);
    Ipv4Addr::from(ip | !mask)
}

/// Endereços para os quais o beacon deve ser enviado.
///
/// Sempre inclui o broadcast global; inclui o broadcast de cada interface IPv4
/// não-loopback. Duplicatas são removidas, preservando a ordem.
#[must_use]
pub fn broadcast_targets(port: u16) -> Vec<SocketAddr> {
    let mut targets = vec![SocketAddr::from((Ipv4Addr::BROADCAST, port))];

    let Ok(interfaces) = if_addrs::get_if_addrs() else {
        // Sem inventário de interfaces ainda enviamos ao broadcast global.
        return targets;
    };

    for interface in interfaces {
        if interface.is_loopback() {
            continue;
        }
        let IfAddr::V4(v4) = interface.addr else {
            continue;
        };

        let broadcast = v4
            .broadcast
            .unwrap_or_else(|| subnet_broadcast(v4.ip, v4.netmask));
        let target = SocketAddr::from((broadcast, port));

        if !targets.contains(&target) {
            targets.push(target);
        }
    }

    targets
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn broadcast_de_subrede_com_mascara_24() {
        let ip = Ipv4Addr::new(192, 168, 1, 42);
        let mask = Ipv4Addr::new(255, 255, 255, 0);
        assert_eq!(subnet_broadcast(ip, mask), Ipv4Addr::new(192, 168, 1, 255));
    }

    #[test]
    fn broadcast_de_subrede_com_mascara_16() {
        let ip = Ipv4Addr::new(10, 20, 30, 40);
        let mask = Ipv4Addr::new(255, 255, 0, 0);
        assert_eq!(subnet_broadcast(ip, mask), Ipv4Addr::new(10, 20, 255, 255));
    }

    #[test]
    fn broadcast_de_subrede_com_mascara_32() {
        let ip = Ipv4Addr::new(172, 16, 5, 9);
        let mask = Ipv4Addr::new(255, 255, 255, 255);
        assert_eq!(subnet_broadcast(ip, mask), ip);
    }

    #[test]
    fn targets_sempre_incluem_o_broadcast_global() {
        let targets = broadcast_targets(41234);
        let global = SocketAddr::from((Ipv4Addr::BROADCAST, 41234));
        assert!(targets.contains(&global), "broadcast global ausente: {targets:?}");
    }

    #[test]
    fn targets_nao_tem_duplicatas() {
        let targets = broadcast_targets(41234);
        let mut unicos = targets.clone();
        unicos.dedup();
        assert_eq!(targets.len(), unicos.len(), "targets duplicados: {targets:?}");
    }
}
