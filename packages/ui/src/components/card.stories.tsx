import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from './button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './card';
import { CoinChip } from './coin-chip';

const meta = {
  title: 'Components/Card',
  component: Card,
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const BuyThisMonth: Story = {
  render: () => (
    <Card aria-labelledby="buy-title">
      <CardHeader>
        <CardTitle id="buy-title">Buy for October</CardTitle>
        <CardDescription>Due on 5 October 2026</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="flex flex-wrap gap-1">
          <CoinChip coin="BTC" colour="btc" amount="175 €" />
          <CoinChip coin="ETH" colour="eth" amount="75 €" />
        </p>
      </CardContent>
      <CardFooter>
        <Button>Bought as planned</Button>
        <Button variant="ghost">Edit amounts</Button>
      </CardFooter>
    </Card>
  ),
};
