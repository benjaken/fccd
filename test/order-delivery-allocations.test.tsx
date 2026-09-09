import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { OrderDeliveryAllocations } from '@/components/OrderDeliveryAllocations';
import { allocationTotalMatches } from '@/lib/order-delivery-allocations';
import i18n from '@/i18n';

beforeEach(async () => { await i18n.changeLanguage('zh-HK'); });

it('saves a complete split in one request and blocks mismatched totals', async () => {
  const user = userEvent.setup();
  const save = vi.fn().mockResolvedValue(undefined);
  render(<OrderDeliveryAllocations orderId="order" lines={[{
    id: 'line', sku: 'MEAL', productName: '餐盒', content: null,
    quantity: 10, unitPrice: null, totalPrice: null, isAddon: false, remarks: null,
  }]} deliveries={['first', 'second'].map((id) => ({
    id, deliveryAt: '2026-09-10T04:00:00Z', shipOutTime: null,
    status: 'Pending', confirmation: null, fulfilledAt: null, fee: null,
  }))} load={async () => []} save={save} />);
  await user.click(screen.getByRole('button', { name: i18n.t('deliveryAllocations.title') }));
  const inputs = await screen.findAllByRole('spinbutton');
  const button = screen.getByRole('button', { name: i18n.t('deliveryAllocations.save') });
  await user.type(inputs[0], '4');
  expect(button).toBeDisabled();
  await user.type(inputs[1], '6');
  expect(button).toBeEnabled();
  await user.click(button);
  await waitFor(() => expect(save).toHaveBeenCalledExactlyOnceWith('order', [
    { orderLineId: 'line', deliveryId: 'first', quantity: 4 },
    { orderLineId: 'line', deliveryId: 'second', quantity: 6 },
  ]));
});

it('rejects negative, nonfinite and incomplete splits', () => {
  expect(allocationTotalMatches(10, [-1, 11])).toBe(false);
  expect(allocationTotalMatches(10, [NaN])).toBe(false);
  expect(allocationTotalMatches(10, [Infinity])).toBe(false);
  expect(allocationTotalMatches(10, [4, 5])).toBe(false);
  expect(allocationTotalMatches(0.003, [0.001, 0.002])).toBe(true);
});
