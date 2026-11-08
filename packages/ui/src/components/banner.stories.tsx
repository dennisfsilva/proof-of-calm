import type { Meta, StoryObj } from '@storybook/react-vite';
import { Banner, BannerActions, BannerContent, BannerDescription, BannerTitle } from './banner';
import { Button } from './button';

const meta = {
  title: 'Components/Banner',
  component: Banner,
} satisfies Meta<typeof Banner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const BackupNeeded: Story = {
  render: () => (
    <Banner>
      <BannerContent>
        <BannerTitle>Your data lives only on this device</BannerTitle>
        <BannerDescription>Last backup: never. A backup file takes ten seconds.</BannerDescription>
      </BannerContent>
      <BannerActions>
        <Button variant="secondary">Back up now</Button>
        <Button variant="ghost">Later</Button>
      </BannerActions>
    </Banner>
  ),
};
