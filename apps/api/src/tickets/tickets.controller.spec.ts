import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';

describe('TicketsController', () => {
  const buildController = () => {
    const service = { list: jest.fn(), detail: jest.fn() };
    return { controller: new TicketsController(service as unknown as TicketsService), service };
  };

  it('delegates the list call with the optional status query', async () => {
    const { controller, service } = buildController();
    service.list.mockResolvedValue([]);
    await controller.list('OPEN');
    expect(service.list).toHaveBeenCalledWith('OPEN');
  });

  it('delegates the detail call with the route id', async () => {
    const { controller, service } = buildController();
    service.detail.mockResolvedValue({});
    await controller.detail('tkt-1');
    expect(service.detail).toHaveBeenCalledWith('tkt-1');
  });
});
