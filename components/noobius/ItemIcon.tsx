import {
  Box,
  Cable,
  Droplets,
  Cpu,
  Network,
  Gem,
  Wrench,
  CircuitBoard,
  Fan,
  BatteryCharging,
  Coffee,
} from 'lucide-react';
import type { ItemId } from '@/lib/facility';
const icons = {
  scrap: Box,
  copper: Cable,
  coolant: Droplets,
  silicon: Cpu,
  fiber: Network,
  core: Gem,
  kit: Wrench,
  board: CircuitBoard,
  pump: Fan,
  battery: BatteryCharging,
  coffee: Coffee,
};
export default function ItemIcon({
  item,
  size = 22,
}: {
  item: ItemId;
  size?: number;
}) {
  const Icon = icons[item];
  return <Icon size={size} aria-hidden="true" />;
}
