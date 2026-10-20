package publicproxy

import (
	"context"
	"crypto/x509"
	"encoding/pem"
	"errors"

	"golang.org/x/crypto/acme/autocert"
)

// certFromCache reads the leaf certificate of a domain out of the cache of autocert (a private key followed by the chain, in PEM)
func certFromCache(ctx context.Context, cache autocert.Cache, host string) (*Certificate, error) {
	data, err := cache.Get(ctx, host)
	if err != nil {
		if errors.Is(err, autocert.ErrCacheMiss) {
			return nil, nil
		}
		return nil, err
	}
	for {
		var block *pem.Block
		block, data = pem.Decode(data)
		if block == nil {
			return nil, nil
		}
		if block.Type != "CERTIFICATE" {
			continue
		}
		cert, err := x509.ParseCertificate(block.Bytes)
		if err != nil {
			return nil, err
		}
		return &Certificate{NotBefore: cert.NotBefore, NotAfter: cert.NotAfter, Issuer: cert.Issuer.CommonName}, nil
	}
}
