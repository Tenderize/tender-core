module.exports = {
    skipFiles: [
        'libs',
        'test',
        'tenderizer/test',
        'tenderizer/ITenderizer.sol',
        'tenderizer/integrations/livepeer/ILivepeer.sol',
        'tenderizer/integrations/livepeer/LivepeerMock.sol',
        'tenderizer/integrations/graph/IGraph.sol',
        'tenderizer/integrations/graph/GraphMock.sol',
        'tenderizer/integrations/matic/IMatic.sol',
        'tenderizer/integrations/matic/MaticMock.sol',
        'liquidity/ElasticSupplyPool.sol',
        'liquidity/IElasticSupplyPool.sol',
        'liquidity/IOneInch.sol',
        'token/ITenderToken.sol',
        'token/NamedToken.sol'
    ]
  };